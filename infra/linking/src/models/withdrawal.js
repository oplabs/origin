'use strict';
module.exports = (sequelize, DataTypes) => {
  const Withdrawal = sequelize.define('Withdrawal', {
    ethAddress: DataTypes.STRING,
    amount: DataTypes.DOUBLE,
    amountType: DataTypes.STRING,
    amountUsd: DataTypes.DOUBLE,
    signature: DataTypes.STRING,
    transactionHash: DataTypes.STRING,
    recipientInfo: DataTypes.JSON,
    status: DataTypes.STRING
  }, {
    tableName:'withdrawal'
  });
  Withdrawal.associate = function(models) {
    // associations can be defined here
  };
  return Withdrawal;
};
