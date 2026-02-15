module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;

    if (!data.quantity || !data.price) {
      throw new Error("Quantity and price are required");
    }

    data.totalAmount = Number(data.quantity) * Number(data.price);
  },

  async beforeUpdate(event) {
    const { data } = event.params;

    if (data.quantity || data.price) {
      const quantity = data.quantity ?? event.state?.quantity;
      const price = data.price ?? event.state?.price;

      if (quantity && price) {
        data.totalAmount = Number(quantity) * Number(price);
      }
    }
  },
};
