'use strict';
const TableName = 'user_info'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      TableName,
      'rewards_ip',
      {
        type:Sequelize.STRING
      }
    )
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(TableName, 'rewards_ip')
  }
};
