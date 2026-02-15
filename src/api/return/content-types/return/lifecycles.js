module.exports = {
  async afterCreate(event) {
    const { result } = event;

    try {
      // 1. جلب بيانات المرتجع كاملة
      const fullReturn = await strapi.documents("api::return.return").findOne({
        documentId: result.documentId,
        populate: {
          order: { populate: ["customer"] },
          returned_items: true
        }
      });

      if (!fullReturn?.order) return;

      // 2. حساب إجمالي مبلغ المرجوعات
      const totalRefundValue = fullReturn.returned_items.reduce((sum, item) => {
        return sum + Number(item.totalAmount || 0);
      }, 0);

      // تحديث إجمالي المرتجع في السجل الحالي
      await strapi.documents("api::return.return").update({
        documentId: result.documentId,
        data: { totalAmount: totalRefundValue }
      });

      const customer = fullReturn.order.customer;
      const order = fullReturn.order;

      // 3. تحديث مديونية العميل
      if (customer) {
        const currentDebt = Number(customer.totalDebt || 0);
        const newDebt = Math.max(0, currentDebt - totalRefundValue);

        await strapi.documents("api::customer.customer").update({
          documentId: customer.documentId,
          data: { totalDebt: newDebt }
        });
      }

      // 4. تحديث الأوردر (تعديل اسم الحقل هنا إلى orderStatus)
      const currentRemaining = Number(order.remainingAmount || 0);
      
      await strapi.documents("api::order.order").update({
        documentId: order.documentId,
        data: {
          remainingAmount: Math.max(0, currentRemaining - totalRefundValue),
          // التعديل هنا:
          orderStatus: 'Partially Returned' 
        }
      });

      console.log(`✅ Return Processed. Order [${order.documentId}] status: Partially Returned`);

    } catch (err) {
      console.error("❌ afterCreate Return Error:", err.message);
    }
  }
};