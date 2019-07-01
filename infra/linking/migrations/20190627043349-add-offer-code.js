'use strict';
const TableName = 'webrtc_offer'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      TableName,
      'code',
      {
        type:Sequelize.Sequelize.STRING,
        unique: true
      }
    )
  },
  down: (queryInterface, Sequelize) => {
   return queryInterface.removeColumn(TableName, 'code')
  }
};
