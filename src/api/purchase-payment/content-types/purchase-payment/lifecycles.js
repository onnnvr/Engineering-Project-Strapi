module.exports = {
  async afterCreate(event) {
    const { result } = event;

    // جلب بيانات الدفعة كاملة مع التاجر وفاتورة المشتريات المرتبطة
    const payment = await strapi.documents("api::purchase-payment.purchase-payment").findOne({
      documentId: result.documentId,
      populate: ["trader", "purchase"],
    });

    if (!payment || !payment.trader) {
      console.log("⚠️ No trader associated with this purchase payment.");
      return;
    }

    const traderDocId = payment.trader.documentId;
    const targetPurchaseDocId = payment.purchase?.documentId;
    let remainingPayment = Number(payment.amount);

    try {
      // 1. إذا كانت الدفعة موجهة لفاتورة مشتريات محددة (Manual Allocation)
      if (targetPurchaseDocId) {
        const purchase = await strapi.documents("api::purchase.purchase").findOne({
          documentId: targetPurchaseDocId,
        });

        if (purchase && !purchase.paid) {
          const purchaseBalance = Number(purchase.remainingAmount ?? purchase.totalAmount);

          if (remainingPayment >= purchaseBalance) {
            remainingPayment -= purchaseBalance;
            await strapi.documents("api::purchase.purchase").update({
              documentId: targetPurchaseDocId,
              data: { remainingAmount: 0, paid: true },
            });
          } else {
            await strapi.documents("api::purchase.purchase").update({
              documentId: targetPurchaseDocId,
              data: { remainingAmount: purchaseBalance - remainingPayment, paid: false },
            });
            remainingPayment = 0;
          }
        }
      }

      // 2. توزيع الباقي على أقدم فواتير المشتريات غير المدفوعة لهذا التاجر
      if (remainingPayment > 0) {
        const unpaidPurchases = await strapi.documents("api::purchase.purchase").findMany({
          filters: {
            trader: { documentId: traderDocId },
            paid: false,
          },
          sort: { createdAt: "asc" },
        });

        for (const purchase of unpaidPurchases) {
          if (remainingPayment <= 0) break;
          
          if (purchase.documentId === targetPurchaseDocId) continue;

          const purchaseBalance = Number(purchase.remainingAmount ?? purchase.totalAmount);

          if (remainingPayment >= purchaseBalance) {
            remainingPayment -= purchaseBalance;
            await strapi.documents("api::purchase.purchase").update({
              documentId: purchase.documentId,
              data: { remainingAmount: 0, paid: true },
            });
          } else {
            await strapi.documents("api::purchase.purchase").update({
              documentId: purchase.documentId,
              data: { remainingAmount: purchaseBalance - remainingPayment, paid: false },
            });
            remainingPayment = 0;
          }
        }
      }

      // --- التعديل الجوهري هنا ---
      // 3. تحديث إجمالي مديونية التاجر بناءً على تجميع المتبقي في فواتيره (Recalculate)
      const allUnpaid = await strapi.documents("api::purchase.purchase").findMany({
        filters: {
          trader: { documentId: traderDocId },
          paid: false,
        },
      });

      const actualDebt = allUnpaid.reduce((sum, pur) => sum + Number(pur.remainingAmount || 0), 0);

      await strapi.documents("api::trader.trader").update({
        documentId: traderDocId,
        data: { totalDebt: actualDebt },
      });

      console.log(`✅ Success! Trader debt recalculated from actual invoices. New Total: ${actualDebt}`);

    } catch (err) {
      console.error("❌ Purchase Payment Lifecycle Error:", err.message);
    }
  },
};