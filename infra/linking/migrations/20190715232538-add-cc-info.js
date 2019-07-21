'use strict';
const TableName = 'webrtc_offer'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      TableName,
      'cc_info',
      {
        type:Sequelize.Sequelize.JSON
      }
    )
  },

  down: (queryInterface, Sequelize) => {
   return queryInterface.removeColumn(TableName, 'cc_info')
  }
};
