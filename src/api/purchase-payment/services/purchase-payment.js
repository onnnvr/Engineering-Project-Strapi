'use strict';

/**
 * purchase-payment service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::purchase-payment.purchase-payment');
