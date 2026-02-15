// path: ./src/api/purchase/content-types/purchase/lifecycles.js

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    const ctx = strapi.requestContext.get();

    if (ctx?.state?.user) {
      data.user = { connect: [ctx.state.user.id] };
      console.log("✅ User connected to Purchase:", ctx.state.user.id);
    }

    await calculatePurchaseTotals(event);

    data.remainingAmount = data.paid ? 0 : data.totalAmount;
  },

  async beforeUpdate(event) {
    const { data } = event.params;
    
    await calculatePurchaseTotals(event);

    // --- تعديل المرتجع للمورد: لو الحالة Cancelled أو Returned نصفر المديونية ونعدل المخزن ---
    if (data.status === 'Cancelled' || data.status === 'Returned') {
      data.remainingAmount = 0;
      data.paid = true; 
    } else {
      if (data.paid === true) {
        data.remainingAmount = 0;
      } else if (data.paid === false && data.totalAmount) {
        data.remainingAmount = data.totalAmount;
      }
    }
  },

  async afterCreate(event) {
    const { result } = event;
    const ctx = strapi.requestContext.get();

    // زيادة المخزن عند الشراء
    await addInventoryStock(result);

    if (!result.paid && result.totalAmount > 0) {
      await updateTraderDebt(result);
    }

    if (result.publishedAt && result.totalAmount > 0) {
      await sendPurchaseAdminNotification(result, 'فاتورة شراء جديدة (New Purchase)');
      if (ctx) ctx.state.emailSent = true;
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    const ctx = strapi.requestContext.get();

    // --- لو الحالة بقت مرتجع، نقص اللي دخلناه المخزن تاني ---
    if (result.status === 'Returned' || result.status === 'Cancelled') {
      await handlePurchaseReturnStock(result);
    }

    await refreshTraderTotalDebt(result);

    if (result.publishedAt && result.totalAmount > 0) {
      if (ctx && !ctx.state.emailSent) {
        await sendPurchaseAdminNotification(result, 'تحديث فاتورة شراء (Purchase Notification)');
        ctx.state.emailSent = true;
      }
    }
  }
};

// --- دالة معالجة المرتجع للمورد (تنقص المخزن) ---
async function handlePurchaseReturnStock(purchase) {
  try {
    const fullPurchase = await strapi.documents("api::purchase.purchase").findOne({
      documentId: purchase.documentId,
      populate: ["purchase_items", "purchase_items.product", "purchase_items.warehouse"],
    });

    const items = fullPurchase?.purchase_items || [];
    for (const item of items) {
      const productId = item.product?.documentId;
      const warehouseId = item.warehouse?.documentId;

      if (productId && warehouseId) {
        const inventoryRecords = await strapi.documents("api::inventory.inventory").findMany({
          filters: {
            product: { documentId: productId },
            warehouse: { documentId: warehouseId }
          }
        });

        const stockRecord = inventoryRecords[0];
        if (stockRecord) {
          const currentQty = Number(stockRecord.quantity || 0);
          const purchaseQty = Number(item.quantity || 0);
          const newQuantity = Math.max(0, currentQty - purchaseQty); // نقص المخزن لأننا رجعنا البضاعة للمورد

          await strapi.documents("api::inventory.inventory").update({
            documentId: stockRecord.documentId,
            data: { quantity: newQuantity }
          });
          console.log(`⏪ [RETURNED TO SUPPLIER] Product: ${item.product.title} | New Qty: ${newQuantity}`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Purchase Return Stock Error:", err.message);
  }
}

// --- تحديث مديونية التاجر الكلية ---
async function refreshTraderTotalDebt(purchase) {
  try {
    const fullPurchase = await strapi.documents("api::purchase.purchase").findOne({
      documentId: purchase.documentId,
      populate: ["trader"]
    });

    const traderDocId = fullPurchase.trader?.documentId;
    if (!traderDocId) return;

    const unpaidPurchases = await strapi.documents("api::purchase.purchase").findMany({
      filters: {
        trader: { documentId: traderDocId },
        paid: false
      }
    });

    const newTotalDebt = unpaidPurchases.reduce((sum, pur) => sum + Number(pur.remainingAmount || 0), 0);

    await strapi.documents("api::trader.trader").update({
      documentId: traderDocId,
      data: { totalDebt: newTotalDebt }
    });
  } catch (err) {
    console.error("❌ Refresh Trader Debt Error:", err.message);
  }
}

// --- تحديث مديونية التاجر عند إنشاء فاتورة ---
async function updateTraderDebt(purchase) {
  try {
    const fullPurchase = await strapi.documents("api::purchase.purchase").findOne({
      documentId: purchase.documentId,
      populate: ["trader"]
    });

    const traderDocId = fullPurchase.trader?.documentId;
    if (traderDocId) {
      const trader = await strapi.documents("api::trader.trader").findOne({
        documentId: traderDocId
      });

      const currentDebt = Number(trader.totalDebt || 0);
      await strapi.documents("api::trader.trader").update({
        documentId: traderDocId,
        data: {
          totalDebt: currentDebt + Number(purchase.totalAmount)
        }
      });
    }
  } catch (err) {
    console.error("❌ Trader Debt Update Error:", err.message);
  }
}

// --- زيادة المخزن (عملية الشراء) ---
async function addInventoryStock(purchase) {
  try {
    const fullPurchase = await strapi.documents("api::purchase.purchase").findOne({
      documentId: purchase.documentId,
      populate: ["purchase_items", "purchase_items.product", "purchase_items.warehouse"],
    });

    const items = fullPurchase?.purchase_items || [];
    for (const item of items) {
      const productId = item.product?.documentId;
      const warehouseId = item.warehouse?.documentId;

      if (productId && warehouseId) {
        const inventoryRecords = await strapi.documents("api::inventory.inventory").findMany({
          filters: {
            product: { documentId: productId },
            warehouse: { documentId: warehouseId }
          }
        });

        const stockRecord = inventoryRecords[0];
        if (stockRecord) {
          const currentQty = Number(stockRecord.quantity || 0);
          const purchaseQty = Number(item.quantity || 0);
          const newQuantity = currentQty + purchaseQty;

          await strapi.documents("api::inventory.inventory").update({
            documentId: stockRecord.documentId,
            data: { quantity: newQuantity }
          });
        } else {
          await strapi.documents("api::inventory.inventory").create({
            data: {
              product: { connect: [productId] },
              warehouse: { connect: [warehouseId] },
              quantity: Number(item.quantity)
            }
          });
        }
      }
    }
  } catch (err) {
    console.error("❌ Stock Update Error:", err.message);
  }
}

// --- حساب إجمالي الفاتورة ---
async function calculatePurchaseTotals(event) {
  const { data, where } = event.params;
  try {
    let itemIds = [];
    if (data.purchase_items?.connect) {
      itemIds = data.purchase_items.connect.map(item => item.id || item.documentId);
    } else if (Array.isArray(data.purchase_items)) {
      itemIds = data.purchase_items.map(item => typeof item === 'object' ? item.id : item);
    }

    if (itemIds.length === 0 && where) {
      const current = await strapi.documents("api::purchase.purchase").findOne({
        documentId: where.documentId || where.id,
        populate: ["purchase_items"],
      });
      itemIds = current?.purchase_items?.map(item => item.id) || [];
    }

    if (itemIds.length === 0) return;

    const items = await strapi.documents("api::purchase-item.purchase-item").findMany({
      filters: { id: { $in: itemIds } },
    });

    const total = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    data.totalAmount = total;
  } catch (err) {
    console.error("❌ Calculation Error:", err.message);
  }
}

// --- إرسال الإيميل ---
async function sendPurchaseAdminNotification(purchase, actionTitle) {
  try {
    await strapi.plugins['email'].services.email.send({
      to: 'omarelbrns4556@gmail.com',
      subject: `📦 ${actionTitle} - ID: ${purchase.documentId}`,
      html: `
        <div style="font-family: Arial; direction: rtl; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 10px;">إشعار مشتريات</h2>
          <p><strong>الإجراء:</strong> ${actionTitle}</p>
          <p><strong>رقم الفاتورة:</strong> ${purchase.documentId}</p>
          <hr/>
          <p><strong>الإجمالي:</strong> ${purchase.totalAmount} EGP</p>
          <p><strong>حالة الدفع للتاجر:</strong> ${purchase.paid ? '✅ تم الدفع' : '⏳ متبقي'}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('📧 Email Error:', err.message);
  }
}