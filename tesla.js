module.exports = function(RED) {
    var tjs = require('teslajs');

    const wakeUpTries = 12;
    const vehicles = [];

    /* Config */
    function TeslaConfigNode(n) {
        RED.nodes.createNode(this,n);

        var node = this;
        const credentials = this.credentials;

        this.populateVehicleList = function() {
            const options = { authToken: this.token };
            tjs.vehicle(options, function (err, vehicle) {
                if (vehicle){
                    vehicles.push(vehicle);
                }
            });
        }

        if (credentials && credentials.email && credentials.password){
            if (credentials.token){
                // TODO Verify it's a working token
                node.token = credentials.token;
                node.populateVehicleList();
            } else {
                /* We need to login to get the token */
                tjs.login(credentials.email, credentials.password, function(err, result) {
                    if (result.error) {
                        node.error(JSON.stringify(result.error));
                    } else {
                        var token = result.authToken;
                        if (token) {
                            var token_cred = {
                                'token': token,
                                'email': credentials.email,
                                'password': credentials.password
                            };
                            RED.nodes.addCredentials(n.id, token_cred);
                            node.token = token;
                            node.populateVehicleList();
                        } else {
                            node.error("Failed to get token");
                        }
                    }
                });
            }
        } else {
            node.warn("No credentials set")
        }
    }

    RED.nodes.registerType("tesla-config", TeslaConfigNode,
        {credentials: {
            email: {type:"text"},
            password: { type: "text"},
            token: { type: "text" }
        }}
    );

    /* Vehicle */
    function TeslaVehicleNode(n) {
        RED.nodes.createNode(this,n);
        this.vehicle = n.vehicle;
    }

    RED.nodes.registerType("tesla-vehicle", TeslaVehicleNode);

    /* HELPERS */
    /* Http endpoints */
    RED.httpAdmin.get('/tesla-control/vehicles', /*RED.auth.needsPermission('tesla-control.read'),*/ function(req, res){
        res.json(vehicles);
    });

    const f2c = function(degf) {
        return (degf - 32) * 5 / 9;
    }

    const wakeUp = function(options, tries, callback) {
        tjs.wakeUp(options, function (err, result) {
            wakeLoop(options, tries, callback);
        });
    }

    const wakeLoop = function(options, tries, callback) {
        if (tries - 1 <= 0){
            console.log("Timed out")
            callback(true);
            return;
        }
        tjs.vehicle(options, function(err, vehicleData) {
            if (err || vehicleData.state !== "online"){
                console.log("car not online, waiting...")
                setTimeout(function() { 
                    wakeLoop(options, tries - 1, callback) 
                }, 5000);
            } else{
                console.log("All set, call original callback")
                callback(false);
            }
        });
    };

    /* Climate */
    function TeslaClimate(n) {
        RED.nodes.createNode(this, n);

        var node = this;
        const configNode = RED.nodes.getNode(n.config);
        const vehicleNode = RED.nodes.getNode(n.vehicle);
        const credentials = configNode.credentials;

        node.on('input', function(msg) {
            console.log("Climate input");
            const temperature = msg.temperature || n.temperature || "";
            // TODO: Verify temperature

            if (!credentials.token) {
                node.error("Missing token TeslaClimate");
                return;
            }
            if (!vehicleNode) {
                node.error("Vehicle not set TeslaClimate")
                return;
            }

            var options = { authToken: credentials.token, vehicleID: vehicleNode.vehicle };

            wakeUp(options, wakeUpTries, function(timeout) {
                if (timeout) {
                    msg.error = "Failed to wake up car";
                    node.send([null, msg]);
                }
                tjs.climateStart(options, function (err, result) {
                    if (result) {
                        if (temperature){
                            tjs.setTemps(options, temperature, temperature, function (err, result) {
                                if (result) {
                                    node.send([msg, null]);
                                } else {
                                    msg.error = "Failed to set temperature";
                                    node.send([null, msg]);
                                }
                            });
                        } else {
                            node.send([msg, null]);
                        }
                    } else {
                        msg.error = "Failed to start climate";
                        node.send([null, msg]);
                    }
                });
            });
        });
    }
    RED.nodes.registerType("tesla-climate", TeslaClimate);

    /* Climate State*/
    function TeslaClimateState(n) {
        RED.nodes.createNode(this, n);

        var node = this;
        const configNode = RED.nodes.getNode(n.config);
        const vehicleNode = RED.nodes.getNode(n.vehicle);
        const credentials = configNode.credentials;

        node.on('input', function(msg) {
            if (!credentials.token) {
                node.error("Missing token TeslaClimateState");
                return;
            }
            if (!vehicleNode) {
                node.error("Vehicle not set TeslaClimateState")
                return;
            }

            var options = { authToken: credentials.token, vehicleID: vehicleNode.vehicle };

            wakeUp(options, wakeUpTries, function(timeout) {
                if (timeout){
                    node.error("Could not wake up car TeslaClimateState");
                    return;
                }
                tjs.climateState(options, function (err, result) {
                    if (result) {
                        console.log("Done")
                        msg.payload = result;
                        node.send(msg);
                    } else {
                        console.log(err);
                    }
                });
            });
        });
    }
    RED.nodes.registerType("tesla-climate-state", TeslaClimateState);


    /* Vehicle State */
    function TeslaVehicleState(n) {
        RED.nodes.createNode(this, n);

        var node = this;
        const configNode = RED.nodes.getNode(n.config);
        const vehicleNode = RED.nodes.getNode(n.vehicle);
        const credentials = configNode.credentials;

        node.on('input', function(msg) {
            if (!credentials.token) {
                node.error("Missing token TeslaVehicleState");
                return;
            }
            if (!vehicleNode) {
                node.error("Vehicle not set TeslaVehicleState")
                return;
            }

            var options = { authToken: credentials.token, vehicleID: vehicleNode.vehicle };

            wakeUp(options, wakeUpTries, function(timeout) {
                if (timeout){
                    node.error("Could not wake up car TeslaClimateState");
                    return;
                }
                tjs.vehicleState(options, function (err, result) {
                    if (result) {
                        console.log("Done")
                        msg.payload = result;
                        node.send(msg);
                    } else {
                        console.log(err);
                    }
                });
            });
        });
    }
    RED.nodes.registerType("tesla-vehicle-state", TeslaVehicleState);
    
    /* Drive State */
    function TeslaDriveState(n) {
        RED.nodes.createNode(this, n);

        const node = this;
        const configNode = RED.nodes.getNode(n.config);
        const vehicleNode = RED.nodes.getNode(n.vehicle);
        const credentials = configNode.credentials;

        node.on('input', function(msg) {
            if (!credentials.token) {
                node.error("Missing token TeslaDriveState");
                return;
            }
            if (!vehicleNode) {
                node.error("Vehicle not set TeslaDriveState")
                return;
            }

            var options = { authToken: credentials.token, vehicleID: vehicleNode.vehicle };

            wakeUp(options, wakeUpTries, function(timeout) {
                if (timeout){
                    node.error("Could not wake up car TeslaClimateState");
                    return;
                }
                tjs.driveState(options, function (err, result) {
                    if (result) {
                        console.log("Done driveState")
                        msg.payload = result;
                        node.send(msg);
                    } else {
                        console.log(err);
                    }
                });
            });
        });
    }
    RED.nodes.registerType("tesla-drive-state", TeslaDriveState);

    /* Vehicle Data */
    function TeslaVehicleData(n) {
        RED.nodes.createNode(this, n);

        const node = this;
        const configNode = RED.nodes.getNode(n.config);
        const vehicleNode = RED.nodes.getNode(n.vehicle);
        const credentials = configNode.credentials;

        node.on('input', function(msg) {
            if (!credentials.token) {
                node.error("Missing token TeslaVehicleData");
                return;
            }
            if (!vehicleNode) {
                node.error("Vehicle not set TeslaVehicleData")
                return;
            }

            var options = { authToken: credentials.token, vehicleID: vehicleNode.vehicle };

            wakeUp(options, wakeUpTries, function(timeout) {
                if (timeout){
                    node.error("Could not wake up car TeslaVehicleData");
                    return;
                }
                tjs.vehicleData(options, function (err, result) {
                    if (result) {
                        console.log("Done vehicleData")
                        msg.payload = result;
                        node.send(msg);
                    } else {
                        console.log(err);
                    }
                });
            });
        });
    }
    RED.nodes.registerType("tesla-vehicle-data", TeslaVehicleData);
}
