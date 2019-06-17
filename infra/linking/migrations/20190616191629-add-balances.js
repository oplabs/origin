'use strict';
const TableName = 'user_info'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return Promise.all([queryInterface.addColumn(
      TableName,
      'balance',
      {
        type:Sequelize.STRING,
        defaultValue:'0'
      }
    ),
    queryInterface.addColumn(
      TableName,
      'locked_balance',
      {
        type:Sequelize.STRING,
        defaultValue:'0'
      }
    ),
    queryInterface.addColumn(
      TableName,
      'promote_balance',
      {
        type:Sequelize.STRING,
        defaultValue:'0'
      }
    ),
    queryInterface.addColumn(
      TableName,
      'last_offer_id',
      {
        type:Sequelize.INTEGER,
        defaultValue:0
      }
    )

    ])
  },
  down: (queryInterface, Sequelize) => {
    return Promise.all([
      queryInterface.removeColumn(TableName, 'balance'),
      queryInterface.removeColumn(TableName, 'promote_balance'),
      queryInterface.removeColumn(TableName, 'locked_balance'),
      queryInterface.removeColumn(TableName, 'last_offer_id')
    ])

  }
};
