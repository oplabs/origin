'use strict';
const TableName = 'user_info'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      TableName,
      'rewards_balance',
      {
        type:Sequelize.STRING,
        defaultValue:'0'
      }
    )
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(TableName, 'rewards_balance')
  }
};
