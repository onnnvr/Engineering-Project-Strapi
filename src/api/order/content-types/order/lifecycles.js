// path: ./src/api/order/content-types/order/lifecycles.js

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    const ctx = strapi.requestContext.get();

    if (ctx?.state?.user) {
      data.user = { connect: [ctx.state.user.id] };
      console.log("✅ User connected:", ctx.state.user.id);
    }

    await calculateOrderTotals(event);

    data.remainingAmount = data.paid ? 0 : data.totalAmount;
  },

  async beforeUpdate(event) {
    const { data } = event.params;
    
    await calculateOrderTotals(event);

    if (data.orderStatus === 'Returned') {
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

    // تحديث المخزن والديون (عمليات أساسية ننتظرها)
    await updateInventoryStock(result);

    if (!result.paid && result.totalAmount > 0) {
      await updateCustomerDebt(result);
    }

    // 🚀 تعديل: إرسال الإيميل بدون await لسرعة الاستجابة
    if (result.publishedAt && result.totalAmount > 0) {
      sendAdminNotification(result, 'طلب جديد (New Order)');
      if (ctx) ctx.state.emailSent = true;
    }
  },

  async afterUpdate(event) {
    const { result } = event;
    const ctx = strapi.requestContext.get();

    if (result.orderStatus === 'Returned') {
      await handleOrderReturnStock(result);
    }

    await refreshCustomerTotalDebt(result);

    // 🚀 تعديل: إرسال الإيميل بدون await لسرعة الاستجابة
    if (result.publishedAt && result.totalAmount > 0) {
      if (ctx && !ctx.state.emailSent) {
        sendAdminNotification(result, 'إشعار طلب (Order Notification)');
        ctx.state.emailSent = true;
      }
    }
  }
};

// --- تحسين دوال المرتجع والمخزن باستخدام Promise.all لسرعة خرافية ---

async function handleOrderReturnStock(order) {
  try {
    const fullOrder = await strapi.documents("api::order.order").findOne({
      documentId: order.documentId,
      populate: ["order_items.product", "order_items.warehouse"],
    });

    const items = fullOrder?.order_items || [];
    
    // 🚀 تحديث كل الأصناف بالتوازي
    await Promise.all(items.map(async (item) => {
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
          const orderQty = Number(item.quantity || 0);
          return strapi.documents("api::inventory.inventory").update({
            documentId: stockRecord.documentId,
            data: { quantity: currentQty + orderQty }
          });
        }
      }
    }));
    console.log(`⏪ [RETURNED TO STOCK] Batch update completed for order: ${order.documentId}`);
  } catch (err) {
    console.error("❌ Return Stock Error:", err.message);
  }
}

async function updateInventoryStock(order) {
  try {
    const fullOrder = await strapi.documents("api::order.order").findOne({
      documentId: order.documentId,
      populate: ["order_items.product", "order_items.warehouse"],
    });

    const items = fullOrder?.order_items || [];

    // 🚀 تحديث كل الأصناف بالتوازي
    await Promise.all(items.map(async (item) => {
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
          const orderQty = Number(item.quantity || 0);
          return strapi.documents("api::inventory.inventory").update({
            documentId: stockRecord.documentId,
            data: { quantity: Math.max(0, currentQty - orderQty) }
          });
        }
      }
    }));
  } catch (err) {
    console.error("❌ Stock Update Error:", err.message);
  }
}

// --- باقي الدوال (حساب الديون والأسعار) ---

async function refreshCustomerTotalDebt(order) {
  try {
    const fullOrder = await strapi.documents("api::order.order").findOne({
      documentId: order.documentId,
      populate: ["customer"]
    });

    const customerDocId = fullOrder.customer?.documentId;
    if (!customerDocId) return;

    const unpaidOrders = await strapi.documents("api::order.order").findMany({
      filters: {
        customer: { documentId: customerDocId },
        paid: false
      }
    });

    const newTotalDebt = unpaidOrders.reduce((sum, ord) => sum + Number(ord.remainingAmount || 0), 0);

    await strapi.documents("api::customer.customer").update({
      documentId: customerDocId,
      data: { totalDebt: newTotalDebt }
    });
  } catch (err) {
    console.error("❌ Refresh Debt Error:", err.message);
  }
}

async function updateCustomerDebt(order) {
  try {
    const fullOrder = await strapi.documents("api::order.order").findOne({
      documentId: order.documentId,
      populate: ["customer"]
    });

    const customerDocId = fullOrder.customer?.documentId;
    if (customerDocId) {
      const customer = await strapi.documents("api::customer.customer").findOne({
        documentId: customerDocId
      });

      const currentDebt = Number(customer.totalDebt || 0);
      await strapi.documents("api::customer.customer").update({
        documentId: customerDocId,
        data: { totalDebt: currentDebt + Number(order.totalAmount) }
      });
    }
  } catch (err) {
    console.error("❌ Customer Debt Update Error:", err.message);
  }
}

async function calculateOrderTotals(event) {
  const { data, where } = event.params;
  try {
    let orderItemIds = [];
    if (data.order_items?.connect) {
      orderItemIds = data.order_items.connect.map(item => item.id || item.documentId);
    } else if (Array.isArray(data.order_items)) {
      orderItemIds = data.order_items.map(item => typeof item === 'object' ? item.id : item);
    }

    if (orderItemIds.length === 0 && where) {
      const currentOrder = await strapi.documents("api::order.order").findOne({
        documentId: where.documentId || where.id,
        populate: ["order_items"],
      });
      orderItemIds = currentOrder?.order_items?.map(item => item.id) || [];
    }

    if (orderItemIds.length === 0) return;

    const items = await strapi.documents("api::order-item.order-item").findMany({
      filters: { id: { $in: orderItemIds } },
    });

    if (!items || items.length === 0) return;

    const subtotal = items.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
    const shouldAddTaxes = data.addTaxes !== undefined ? data.addTaxes : true;
    const taxAmount = shouldAddTaxes ? subtotal * 0.14 : 0;
    const totalAmount = subtotal + taxAmount;

    data.subtotal = subtotal;
    data.taxAmount = taxAmount;
    data.totalAmount = totalAmount;
  } catch (err) {
    console.error("❌ Calculation Error:", err.message);
  }
}

async function sendAdminNotification(order, actionTitle) {
  try {
    await strapi.plugins['email'].services.email.send({
      to: 'omarelbrns4556@gmail.com',
      subject: `⚠ ${actionTitle} - ID: ${order.documentId || order.id}`,
      html: `
        <div style="font-family: Arial; direction: rtl; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">إشعار طلب</h2>
          <p><strong>الإجراء:</strong> ${actionTitle}</p>
          <p><strong>رقم الطلب:</strong> ${order.documentId || order.id}</p>
          <hr/>
          <p><strong>الإجمالي النهائي:</strong> ${order.totalAmount} EGP</p>
          <p><strong>حالة الدفع:</strong> ${order.paid ? '✅ تم الدفع' : '⏳ قيد الانتظار'}</p>
        </div>
      `,
    });
  } catch (err) {
    console.error('📧 Email Error:', err.message);
  }
}