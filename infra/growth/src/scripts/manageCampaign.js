// Script to create campaigns in production.
const db = require('../models')
const enums = require('../enums')
const { tokenToNaturalUnits } = require('../../src/util/token')

const aprilConfig = require('../../campaigns/april')
const mayConfig = require('../../campaigns/may')
const juneConfig = require('../../campaigns/june')

async function createAprilProdCampaign() {
  console.log('Creating April campaign data in prod...')

  /* IMPORTANT when adding new translatable fields update the enums document:
   * origin-dapp/src/constants/Growth$FbtEnum.js
   */
  await db.GrowthCampaign.create({
    nameKey: 'growth.apr2019.name',
    shortNameKey: 'growth.apr2019.short_name',
    rules: JSON.stringify(aprilConfig),
    startDate: Date.parse('March 18, 2019, 00:00 UTC'),
    endDate: Date.parse('May 1, 2019, 00:00 UTC'),
    distributionDate: Date.parse('May 1, 2019, 00:00 UTC'),
    cap: tokenToNaturalUnits(1000000), // Set cap to 1M tokens
    capUsed: 0,
    currency: 'OGN',
    rewardStatus: enums.GrowthCampaignRewardStatuses.NotReady
  })
}

async function createMayProdCampaign() {
  console.log('Creating May campaign data in prod...')

  /* IMPORTANT when adding new translatable fields update the enums document:
   * origin-dapp/src/constants/Growth$FbtEnum.js
   */
  await db.GrowthCampaign.create({
    nameKey: 'growth.may2019.name',
    shortNameKey: 'growth.may2019.short_name',
    rules: JSON.stringify(mayConfig),
    startDate: Date.parse('May 1, 2019, 00:00 UTC'),
    endDate: Date.parse('June 1, 2019, 00:00 UTC'),
    distributionDate: Date.parse('June 1, 2019, 00:00 UTC'),
    cap: tokenToNaturalUnits(1000000), // Set cap to 1M tokens
    capUsed: 0,
    currency: 'OGN',
    rewardStatus: enums.GrowthCampaignRewardStatuses.NotReady
  })
}

async function updateMayProdRules() {
  console.log('Updating May campaign rules in prod...')

  const campaign = await db.GrowthCampaign.findOne({ where: { id: 3 } })
  await campaign.update({ rules: JSON.stringify(mayConfig) })
}

async function createJuneProdCampaign() {
  console.log('Creating June campaign data in prod...')

  /* IMPORTANT when adding new translatable fields update the enums document:
   * origin-dapp/src/constants/Growth$FbtEnum.js
   */
  await db.GrowthCampaign.create({
    nameKey: 'growth.june2019.name',
    shortNameKey: 'growth.june2019.short_name',
    rules: JSON.stringify(juneConfig),
    startDate: Date.parse('June 1, 2019, 00:00 UTC'),
    endDate: Date.parse('July 1, 2019, 00:00 UTC'),
    distributionDate: Date.parse('July 1, 2019, 00:00 UTC'),
    cap: tokenToNaturalUnits(1000000), // Set cap to 1M tokens
    capUsed: 0,
    currency: 'OGN',
    rewardStatus: enums.GrowthCampaignRewardStatuses.NotReady
  })
}

async function updateJuneProdRules() {
  console.log('Updating June campaign rules in prod...')

  const campaign = await db.GrowthCampaign.findOne({ where: { id: 4 } })
  await campaign.update({ rules: JSON.stringify(juneConfig) })
}

const args = {}
process.argv.forEach(arg => {
  const t = arg.split('=')
  const argVal = t.length > 1 ? t[1] : true
  args[t[0]] = argVal
})

if (args['--action'] === 'create') {
  if (args['--month'] === 'april') {
    createAprilProdCampaign().then(() => {
      console.log('Done')
      process.exit()
    })
  } else if (args['--month'] === 'may') {
    createMayProdCampaign().then(() => {
      console.log('Done')
      process.exit()
    })
  } else if (args['--month'] === 'june') {
    createJuneProdCampaign().then(() => {
      console.log('Done')
      process.exit()
    })
  }
} else if (args['--action'] === 'update') {
  if (args['--month'] === 'may') {
    updateMayProdRules().then(() => {
      console.log('Done')
      process.exit()
    })
  } else if (args['--month'] === 'june') {
    updateJuneProdRules().then(() => {
      console.log('Done')
      process.exit()
    })
  }
}
