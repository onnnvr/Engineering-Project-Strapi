'use strict';

/**
 * returned-item service
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::returned-item.returned-item');
