module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    // 1. تنفيذ العملية المطلوبة أولاً
    await next();

    // 2. التحقق من وجود مستخدم (Authenticated User)
    if (!ctx.state.user) return;

    // 3. المسارات المستثناة (عشان السيرفر ميهنجش من كتر التسجيل)
    const excludedPaths = ['/notifications', '/admin', '/content-manager', '/upload', '/i18n', '/users'];
    if (excludedPaths.some(path => ctx.url.includes(path))) return;

    const method = ctx.method;
    const user = ctx.state.user;
    const currentUrl = ctx.url;

    try {
      let actionTitle = "";
      let actionType = "Info";

      // --- [بداية المنطق المعدل] ---
      
      if (method === 'GET') {
        // منطق الـ GET الذكي: منع التكرار في نفس الدقيقة
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        
        const recentNotification = await strapi.documents("api::notification.notification").findMany({
          filters: {
            user: { id: user.id },
            title: "استعراض بيانات (زيارة)",
            createdAt: { $gte: oneMinuteAgo.toISOString() },
            message: { $contains: currentUrl }
          },
          limit: 1,
        });

        if (recentNotification.length > 0) return;

        actionTitle = "استعراض بيانات (زيارة)";
        actionType = "Info";
      } 
      else if (method === 'POST') {
        actionTitle = "إضافة بيانات جديدة";
        actionType = "Success";
      } 
      else if (method === 'PUT' || method === 'PATCH') {
        // هنا الـ PUT والـ PATCH بقوا مع بعض بشكل صريح وواضح
        actionTitle = "تعديل بيانات";
        actionType = "Warning";
      } 
      else if (method === 'DELETE') {
        actionTitle = "حذف بيانات";
        actionType = "Danger";
      } 
      else {
        // أي طريقة تانية (مثل OPTIONS أو HEAD) تجاهلها
        return;
      }

      // --- [نهاية المنطق المعدل] ---

      // 4. حفظ التنبيه في الداتا بيز
      await strapi.documents("api::notification.notification").create({
        data: {
          title: actionTitle,
          message: `الموظف (${user.username}) قام بـ ${actionTitle} في المسار: ${currentUrl}`,
          type: actionType,
          isRead: false,
          user: user.id 
        },
      });

      console.log(`✅ Logged: ${method} by ${user.username} on ${currentUrl}`);

    } catch (err) {
      console.error("❌ Notification Middleware Error:", err.message);
    }
  };
};