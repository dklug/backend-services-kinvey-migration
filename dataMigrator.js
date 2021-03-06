'use strict';

const BackEndServicesApi = require('./backendServicesApi');
//const KinveyServiceApi = require('./kinveyServiceApi');
const FilesMigrator = require('./filesMigrator');
const utils = require('./utils');
//const UsersMigrator = require('./usersMigrator');
const config = require('./config');

const async = require('async');
const Promise = require('bluebird');

var fs = require('fs');

class DataMigrator {
    constructor(logger, config) {
        this.logger = logger;
        this.config = config;
        //this.kinveyServiceApi = new KinveyServiceApi(this.logger, this.config);
        this.backendServicesApi = new BackEndServicesApi(this.logger, this.config);
        this.filesMigrator = new FilesMigrator(this.backendServicesApi, this.logger, this.config);
        //this.usersMigrator = new UsersMigrator(this.backendServicesApi, this.logger, this.config);
    }

    migrateDataContent() {
        let typesMetaData;
        //let kinveyRoles = {};
        let bsRoles = {};
        return new Promise((resolve, reject) => {resolve()})
            .then(() => {
                return utils.checkConfiguration(this.logger, this.config);
            })
            // .then(() => {
            //     return this.kinveyServiceApi.checkManagementAuthorization();
            // })
            .then(() => {
                return this.backendServicesApi.getTypes();
            })
            .then((types) => {
                typesMetaData = types.Result;
                return this.backendServicesApi.getGeoLocationFields(typesMetaData);
            })
            .then((types) => {
                return this.backendServicesApi.getFileFields(types);
            })
            .then(() => {
                return this.backendServicesApi.getRoles();
            })
            .then((roles) => {
                console.log('.then((roles) 1');
                console.log(roles);
                roles.Result.forEach((role) => {
                    console.log('role.name: '+role.Name);
                    bsRoles[role.Id] = role.Name;
                });

                //return this.kinveyServiceApi.getRoles();
            })
            .then((roles) => {
                console.log('.then((roles) 2');
                // roles.forEach((role) => {
                //     console.log(role._id);
                //     //kinveyRoles[role.name] = role._id;
                // });
                return this._migrateTypes(typesMetaData, /*kinveyRoles,*/ bsRoles);
            })
            .then(() => {
                return this.filesMigrator.migrateFiles();
            })
            // .then(() => {
            //     return this.usersMigrator.migrateUsers(kinveyRoles, bsRoles);
            // })
            .then(() => {
                this.logger.info('\nData migration completed.');
                console.log('Data migration completed.');
            })
            .catch((dataMigrationError) => {
                this.logger.error(dataMigrationError.message);
                console.log(dataMigrationError.message);
            });
    }

    _migrateTypes(types, /*kinveyRoles,*/ bsRoles) {
        return Promise.mapSeries(types, (type) => {
            return this._migrateSingleType(type, /*kinveyRoles,*/ bsRoles);
        });
    }

    _migrateSingleType(type, /*kinveyRoles,*/ bsRoles) {
        console.log ('_migrateSingleType - type: '+type+', bsRoles: '+bsRoles);

        const self = this;
        const pageSize = self.config.page_size_data;
        let pageIndex = 0;

        let fetchedItemsCount;
        let copiedItemsCount = 0;
        let announcedItemsCount = 0;

        this.logger.info(`\nMigrating collection ${type.Name}...`);

        return this.backendServicesApi.getItemsCount(type.Name)
        .then((itemsCount) => {
            self.logger.info(`\tItems found: ${itemsCount}`);
            return new Promise((resolve, reject) => {
                async.doUntil(
                    (cb) => {
                        //const collectionName = utils.convertCollectionNameToKinvey(type.Name);
                        const collectionName = type.Name;
                        if (collectionName !== type.Name) {
                            self.logger.warn(`  WARNING: Invalid collection name. Migrating items to "${collectionName}" instead`);
                        }
                        this.backendServicesApi.readItemsFromBS(type, pageIndex * pageSize, pageSize)
                            .then((items) => {
                                fetchedItemsCount = items.length;
                                if (!fs.existsSync('json'))
                                {
                                    fs.mkdirSync('json');
                                }
                                fs.writeFileSync('json/'+collectionName+'.json',JSON.stringify(items));
                                //return this.kinveyServiceApi.insertItems(collectionName, items, kinveyRoles, bsRoles);
                            })
                            .then(() => {
                                cb();
                            })
                            .catch((error) => {
                                reject(error);
                            });
                    },
                    function () {
                        pageIndex++;
                        copiedItemsCount += fetchedItemsCount;
                        if (copiedItemsCount > announcedItemsCount) {
                            self.logger.info(`\tProgress: ${copiedItemsCount} out of ${itemsCount}`);
                            announcedItemsCount += 100;
                        }
                        if (fetchedItemsCount < pageSize) {
                            return true;
                        } else {
                            return false;
                        }
                    },
                    function (err) {
                        if (err) {
                            reject(err);
                        } else {
                            self.logger.info(`\tMigration completed. Items migrated: ${copiedItemsCount}`);
                            resolve();
                        }
                    }
                );
            });
        });

    }
}

module.exports = DataMigrator;
