module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    // التأكد من وجود الكمية والسعر (سعر التكلفة في حالة الشراء)
    if (!data.quantity || !data.price) {
      throw new Error("Quantity and cost price are required for purchase items");
    }

    // حساب إجمالي السطر (Quantity * Cost Price)
    data.totalAmount = Number(data.quantity) * Number(data.price);
  },

  async beforeUpdate(event) {
    const { data, where } = event.params;

    // جلب البيانات الحالية من القاعدة قبل التحديث للمقارنة أو التكملة
    const existingItem = await strapi.entityService.findOne(
      "api::purchase-item.purchase-item",
      where.id
    );

    // إذا تم تعديل الكمية أو السعر، نعيد حساب الإجمالي
    if (data.quantity !== undefined || data.price !== undefined) {
      const quantity = data.quantity ?? existingItem.quantity;
      const price = data.price ?? existingItem.price;

      if (quantity && price) {
        data.totalAmount = Number(quantity) * Number(price);
      }
    }
  },

  // ملاحظة إضافية: ممكن مستقبلاً نستخدم afterCreate هنا لزيادة المخزن أوتوماتيكياً
  async afterCreate(event) {
    const { result, params } = event;
    
    // هنا ممكن نكتب المنطق اللي بيزود الكمية في الـ Warehouse 
    // بمجرد ما الـ Purchase Item يتسيف
  }
};