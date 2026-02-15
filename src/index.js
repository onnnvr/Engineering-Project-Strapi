'use strict';

module.exports = {
  register({ strapi }) { },

  async bootstrap({ strapi }) {
    strapi.db.lifecycles.subscribe({
      models: ['plugin::users-permissions.user'],

      async beforeCreate(event) {
        const { data } = event.params;

        // 1. حالة التسجيل العادي (المدمج :::)
        if (data.username && data.username.includes(':::')) {
          const parts = data.username.split(':::');
          data.username = parts[0];
          data.name = parts[1];
        } 
        
        // 2. حالة جوجل (الاسم الحقيقي والـ Username الفريد)
        else if (data.provider === 'google') {
          // السطر ده هو اللي بيجيب الاسم الحقيقي من جوجل (البروفايل)
          // جوجل بيبعت الاسم في حقل اسمه name أو displayName جوه الـ data
          const googleName = data.name || data.username; 

          // تحديث الـ name بالاسم الحقيقي اللي جاي من حساب جوجل
          data.name = googleName;

          // حل مشكلة الـ Username (عشان ميبقاش هو هو الإيميل وميتكررش)
          // بناخد الجزء الأول من الإيميل ونضيف عليه رقم عشوائي
          const base = data.email ? data.email.split('@')[0] : 'user';
          const randomSuffix = Math.floor(1000 + Math.random() * 9000);
          data.username = `${base}_${randomSuffix}`;
        }
      },
    });

    // كود الـ Cleanup بتاعك زي ما هو
    setInterval(async () => {
      try {
        await strapi.db.query('api::product.product').deleteMany({
          where: {
            isTemporary: true,
            createdAt: { $lt: new Date(Date.now() - 1000 * 60 * 30) },
          },
        });
      } catch (err) {
        console.error('Cleanup temporary products error:', err);
      }
    }, 1000 * 60 * 10);
  },
};