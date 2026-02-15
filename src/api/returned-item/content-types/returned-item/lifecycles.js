module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    // 1. حساب الإجمالي للصنف مع مراعاة ضريبة الأوردر الأصلي
    if (data.price && data.quantity && data.return) {
      try {
        const parentReturn = await strapi.documents("api::return.return").findOne({
          documentId: data.return.documentId || data.return,
          populate: { order: true }
        });

        const originalOrder = parentReturn?.order;
        const subtotal = Number(data.price) * Number(data.quantity);
        
        // التحقق من وجود الضريبة في الأوردر الأصلي
        const hasTax = originalOrder?.addTaxes !== false; 
        const taxMultiplier = hasTax ? 1.14 : 1;

        data.totalAmount = subtotal * taxMultiplier;

        console.log(`⚖️ Item Refund Calc: ${subtotal} x ${taxMultiplier} = ${data.totalAmount}`);
      } catch (err) {
        console.error("❌ beforeCreate returned-item Error:", err.message);
        data.totalAmount = Number(data.price) * Number(data.quantity);
      }
    }
  },

  async afterCreate(event) {
    const { result } = event;

    // 2. تزويد المخزن (Restock)
    if (result.product && result.warehouse && result.quantity > 0) {
      try {
        const inventoryRecords = await strapi.documents("api::inventory.inventory").findMany({
          filters: {
            product: { documentId: result.product.documentId },
            warehouse: { documentId: result.warehouse.documentId }
          }
        });

        if (inventoryRecords[0]) {
          await strapi.documents("api::inventory.inventory").update({
            documentId: inventoryRecords[0].documentId,
            data: {
              quantity: Number(inventoryRecords[0].quantity) + Number(result.quantity)
            }
          });
          console.log(`♻️ Stock Restored: +${result.quantity} for Product: ${result.product.documentId}`);
        }
      } catch (err) {
        console.error("❌ Stock Update Error:", err.message);
      }
    }
  }
};