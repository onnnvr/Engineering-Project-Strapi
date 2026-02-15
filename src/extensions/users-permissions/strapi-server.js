export default (plugin) => {

  // ========== users/me ==========
  plugin.controllers.user.me = async (ctx) => {
    if (!ctx.state.user) {
      return ctx.unauthorized();
    }

    return await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      ctx.state.user.id,
      {
        populate: { role: true },
      }
    );
  };

  // ========== GET /users ==========
  plugin.controllers.user.find = async (ctx) => {
    const users = await strapi.entityService.findMany(
      "plugin::users-permissions.user",
      {
        populate: { role: true },
      }
    );

    return users.map(({ password, resetPasswordToken, confirmationToken, ...u }) => u);
  };

  // ========== GET /users/:id ==========
  plugin.controllers.user.findOne = async (ctx) => {
    const { id } = ctx.params;

    const user = await strapi.entityService.findOne(
      "plugin::users-permissions.user",
      id,
      {
        populate: { role: true },
      }
    );

    if (!user) {
      return ctx.notFound();
    }

    const { password, resetPasswordToken, confirmationToken, ...safe } = user;
    return safe;
  };

  return plugin;
};
