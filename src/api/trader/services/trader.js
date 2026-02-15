'use strict';

/**
 * trader service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::trader.trader');
