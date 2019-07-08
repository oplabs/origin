'use strict';
const TableName = 'withdrawal'

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable(TableName, {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      eth_address: {
        type: Sequelize.STRING
      },
      amount: {
        type: Sequelize.DOUBLE
      },
      amount_type: {
        type: Sequelize.STRING(16)
      },
      amount_usd: {
        type: Sequelize.DOUBLE
      },
      transaction_hash: {
        type: Sequelize.STRING
      },
      signature: {
        type: Sequelize.STRING
      },
      recipient_info: {
        type: Sequelize.JSON
      },
      status : {
        type: Sequelize.STRING(16)
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable(TableName);
  }
};
