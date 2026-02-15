export default {
  async afterCreate(event) {
    const { result } = event;

    const payment = await strapi.documents("api::payment.payment").findOne({
      documentId: result.documentId,
      populate: ["customer", "order"],
    });

    if (!payment || !payment.customer) {
      console.log("⚠️ No customer associated with this payment.");
      return;
    }

    const customerDocId = payment.customer.documentId;
    const targetOrderDocId = payment.order?.documentId;
    let remainingPayment = Number(payment.amount);

    try {
      // 1. توزيع المبلغ على الأوردر المحدد (Manual Allocation)
      if (targetOrderDocId) {
        const order = await strapi.documents("api::order.order").findOne({
          documentId: targetOrderDocId,
        });

        if (order && !order.paid) {
          const orderBalance = Number(order.remainingAmount ?? order.totalAmount);
          if (remainingPayment >= orderBalance) {
            remainingPayment -= orderBalance;
            await strapi.documents("api::order.order").update({
              documentId: targetOrderDocId,
              data: { remainingAmount: 0, paid: true },
            });
          } else {
            await strapi.documents("api::order.order").update({
              documentId: targetOrderDocId,
              data: { remainingAmount: orderBalance - remainingPayment, paid: false },
            });
            remainingPayment = 0;
          }
        }
      }

      // 2. توزيع الباقي على أقدم الفواتير
      if (remainingPayment > 0) {
        const unpaidOrders = await strapi.documents("api::order.order").findMany({
          filters: {
            customer: { documentId: customerDocId },
            paid: false,
          },
          sort: { createdAt: "asc" },
        });

        for (const order of unpaidOrders) {
          if (remainingPayment <= 0) break;
          if (order.documentId === targetOrderDocId) continue;

          const orderBalance = Number(order.remainingAmount ?? order.totalAmount);

          if (remainingPayment >= orderBalance) {
            remainingPayment -= orderBalance;
            await strapi.documents("api::order.order").update({
              documentId: order.documentId,
              data: { remainingAmount: 0, paid: true },
            });
          } else {
            await strapi.documents("api::order.order").update({
              documentId: order.documentId,
              data: { remainingAmount: orderBalance - remainingPayment, paid: false },
            });
            remainingPayment = 0;
          }
        }
      }

      // 3. الحل الذهبي: إعادة حساب المديونية من واقع الأوردرات
      // دي الطريقة اللي هتضمن إن الرقم مستحيل يغلط أو يتخصم مرتين
      const allUnpaidOrders = await strapi.documents("api::order.order").findMany({
        filters: {
          customer: { documentId: customerDocId },
          paid: false,
        },
      });

      const actualTotalDebt = allUnpaidOrders.reduce((sum, order) => {
        return sum + Number(order.remainingAmount ?? 0);
      }, 0);

      await strapi.documents("api::customer.customer").update({
        documentId: customerDocId,
        data: { totalDebt: actualTotalDebt },
      });

      console.log(`✅ Debt Re-calculated for customer ${customerDocId}. Accurate Debt: ${actualTotalDebt}`);

    } catch (err) {
      console.error("❌ Payment Lifecycle Error:", err.message);
    }
  },
};