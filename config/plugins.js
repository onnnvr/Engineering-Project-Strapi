module.exports = ({ env }) => ({
  upload: {
    config: {
      provider: 'cloudinary',
      providerOptions: {
        cloud_name: env('CLOUDINARY_NAME'),
        api_key: env('CLOUDINARY_KEY'),
        api_secret: env('CLOUDINARY_SECRET'),
      },
      actionOptions: {
        upload: {},
        delete: {},
      },
    },
  },
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
  'users-permissions': {
    config: {
      grant: {
        google: {
          staticParameters: {
            // ملاحظة: هنا يجب تغيير localhost إلى رابط موقعك على Railway لاحقاً
            callback: env('STRAPI_URL', 'http://localhost:1337') + '/api/connect/google/callback',
          },
          redirectUri: env('FRONTEND_URL', 'http://localhost:3000') + '/connect/google/redirect',
        },
      },
    },
  },
});