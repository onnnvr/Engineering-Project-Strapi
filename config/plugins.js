module.exports = ({ env }) => ({
  // --- إعدادات الإيميل (زي ما هي عندك) ---
  email: {
    config: {
      provider: 'nodemailer',
      providerOptions: {
        host: env('SMTP_HOST', 'smtp.gmail.com'),
        port: env.int('SMTP_PORT', 465),
        auth: {
          user: env('SMTP_USERNAME'),
          pass: env('SMTP_PASSWORD'),
        },
        secure: true, 
      },
      settings: {
        defaultFrom: env('SMTP_USERNAME'),
        defaultReplyTo: env('SMTP_USERNAME'),
      },
    },
  },

  // --- الضربة القاضية لحل مشكلة الـ Redirect بتاع جوجل ---
  'users-permissions': {
    config: {
      grant: {
        google: {
          staticParameters: {
            // المسار اللي جوجل هيرجع عليه لـ Strapi
            callback: 'http://localhost:1337/api/connect/google/callback',
          },
          // المسار النهائي اللي Strapi هيرميك عليه في الـ React
          redirectUri: 'http://localhost:3000/connect/google/redirect',
        },
      },
    },
  },
});