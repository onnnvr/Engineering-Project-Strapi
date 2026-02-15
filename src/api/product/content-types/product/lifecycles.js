module.exports = {
  async beforeCreate(event) {
    if (!event.params.data.status) {
      event.params.data.status = 'draft';
    }

    if (event.params.data.isTemporary === undefined) {
      event.params.data.isTemporary = true;
    }
  },

  async afterUpdate(event) {
    const { result } = event;

    // لو المنتج اتنشر
    if (result.status === 'published') {
      // اربط الصور المؤقتة
      await strapi.db.query('api::product-image.product-image').updateMany({
        where: { product: result.id, isTemporary: true },
        data: { isTemporary: false },
      });

      // المنتج خلاص بقى رسمي
      await strapi.db.query('api::product.product').update({
        where: { id: result.id },
        data: { isTemporary: false },
      });
    }
  },
};
