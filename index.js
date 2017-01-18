var Service;
var Characteristic;

var https = require('https'),
    assign = require('object-assign');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    Accessory = homebridge.hap.Accessory;
    HomebridgeAPI = homebridge;
    homebridge.registerAccessory('homebridge-tado', 'TADO', TadoAccessory);
}


function TadoAccessory(log, config) {
    var accessory = this;
    this.log = log;
    this.storage = require('node-persist');
    this.name = config['name'];
    this.homeID = config['homeID'];
    this.username = config['username'];
    this.password = config['password'];
    this.zone = config['zone'] || 1;
    this.maxValue = config['maxValue'] || 31;
    this.minValue = config['minValue'] || 16;
    this.useFahrenheit = config['useFahrenheit'];
    this.useSwing = config['useSwing'] || false; // can get values: "ON" or "OFF"
    this.useFanSpeed = config['useFanSpeed'] || false; // can get values: "LOW", "MIDDLE", "HIGH" or "AUTO" depend on your aircon 
    this.zoneMode = "UNKNOWN";
    this.targetTemp = 25;
    
    
    //Init storage
      this.storage.initSync({
        dir: HomebridgeAPI.user.persistPath()
      });
    this.lastMode = this.storage.getItem(this.name) || "";
}

TadoAccessory.prototype.getServices = function() {
    var accessory = this;
    var minValue = accessory.minValue;
    var maxValue = accessory.maxValue;

    if (this.useFahrenheit) {
        minValue = accessory.minValue;
        maxValue = accessory.maxValue;
    }

    this.log("Minimum setpoint " + minValue);
    this.log("Maximum setpoint " + maxValue);

    this.targetTemp = 25;


    var informationService = new Service.AccessoryInformation()
        .setCharacteristic(Characteristic.Manufacturer, 'Tado GmbH')
        .setCharacteristic(Characteristic.Model, 'Tado Smart Heating / AC Control')
        .setCharacteristic(Characteristic.SerialNumber, 'Tado Serial Number');

    this.service = new Service.Thermostat(this.name);
        
    this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .on('get', this.getCurrentHeatingCoolingState.bind(this));

    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
        .on('get', this.getTargetHeatingCoolingState.bind(this))
        .on('set', this.setTargetHeatingCoolingState.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentTemperature)
        .setProps({
            minValue: 0,
            maxValue: 100,
            minStep: 0.01
        })
        .on('get', this.getCurrentTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.TargetTemperature)
        .setProps({
            minValue: minValue,
            maxValue: maxValue,
            minStep: 1
        })
        .on('get', this.getTargetTemperature.bind(this))
        .on('set', this.setTargetTemperature.bind(this));

    this.service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
        .on('get', this.getTemperatureDisplayUnits.bind(this));

    this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity)
        .setProps({
            minValue: 0,
            maxValue: 100,
            minStep: 0.01
        })
        .on('get', this.getCurrentRelativeHumidity.bind(this));

    this.service.addCharacteristic(Characteristic.On);
    this.service.getCharacteristic(Characteristic.On)
        .on('set', this.setTargetHeatingCoolingState.bind(this));

    return [this.service];
}

TadoAccessory.prototype.getCurrentHeatingCoolingState = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);
            accessory.log("Current zone mode is " + obj.setting.mode);
            accessory.log("Current power state is " + obj.setting.power);

            accessory.zoneMode = obj.setting.mode;

            if (obj.setting.temperature != null) {
                if (accessory.useFahrenheit) {
                    accessory.log("Target temperature is " + obj.setting.temperature.fahrenheit + "ºF");
                    accessory.targetTemp = obj.setting.temperature.fahrenheit;
                } else {
                    accessory.log("Target temperature is " + obj.setting.temperature.celsius + "ºC");
                    accessory.targetTemp = obj.setting.temperature.celsius;
                }
            }

            if (JSON.stringify(obj.setting.power).match("OFF")) {
                accessory.log("Current operating state is OFF");
                if (accessory.lastMode !== "OFF") {
                    accessory.storage.setItem(accessory.name, "OFF");
                }
                callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
            } else {
                accessory.log("Current operating state is " + obj.setting.mode);
                 if (JSON.stringify(obj.overlay) == null) {
                    if (accessory.lastMode !== "AUTO") {
                         accessory.storage.setItem(accessory.name, "AUTO");
                    };
                    accessory.log("current operating state is AUTO");
                    accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.AUTO);
                    callback(null, Characteristic.CurrentHeatingCoolingState.AUTO);
                 }  
                else {
                    if (JSON.stringify(obj.setting.mode).match("HEAT")) {
                        if (accessory.lastMode !== "HEAT") {
                            accessory.storage.setItem(accessory.name, "HEAT");
                        };
                        callback(null, Characteristic.CurrentHeatingCoolingState.HEAT); 
                    } else {
                        if (accessory.lastMode !== "COOL") {
                            accessory.storage.setItem(accessory.name, "COOL");
                        };
                        callback(null, Characteristic.CurrentHeatingCoolingState.COOL);
                    }
                }
               
            }
        });
    });
}

TadoAccessory.prototype.getTargetHeatingCoolingState = function(callback) {
    var accessory = this;  
   
    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);

            if (obj.setting.temperature != null) {
                if (accessory.useFahrenheit) {
                    accessory.log("Target temperature is " + obj.setting.temperature.fahrenheit + "ºF");
                    accessory.targetTemp = obj.setting.temperature.fahrenheit;
                } else {
                    accessory.log("Target temperature is " + obj.setting.temperature.celsius + "ºC");
                    accessory.targetTemp = obj.setting.temperature.celsius;
                }
            }

            if (JSON.stringify(obj.overlay) == null) {
                accessory.log("Target operating state is AUTO");
                accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.AUTO);
                callback(null, Characteristic.CurrentHeatingCoolingState.AUTO);
            } else {
                if (JSON.stringify(obj.setting.power).match("OFF")) {
                    accessory.log("Target operating state is OFF");
                    
                    callback(null, Characteristic.CurrentHeatingCoolingState.OFF);
                } else {

                    accessory.log("Target operating state is " + obj.setting.mode);
                    if (JSON.stringify(obj.setting.mode).match("HEAT")) {
                        callback(null, Characteristic.CurrentHeatingCoolingState.HEAT);
                    } else if (JSON.stringify(obj.setting.mode).match("COOL")) {
                        callback(null, Characteristic.CurrentHeatingCoolingState.COOL);
                    }
                }
            }
        });
    });      
}

TadoAccessory.prototype.setTargetHeatingCoolingState = function(state, callback) {
    var accessory = this;

    switch (state) {
        case Characteristic.TargetHeatingCoolingState.OFF:
            accessory.log("Set target state to off");
 
            var body = {
                "termination": {
                    "type": "MANUAL"
                },
                "setting": {
                    "power": "OFF",
                    "type": "AIR_CONDITIONING"
                }
            };
            accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.OFF);        
            accessory._setOverlay(body);
            break;

        case Characteristic.TargetHeatingCoolingState.HEAT:
            accessory.log("Force heating");
            accessory.storage.setItem(accessory.name, "HEAT");
            accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.HEAT);
            accessory._setTargetHeatingOverlay();
            break;

        case Characteristic.TargetHeatingCoolingState.COOL:
            accessory.log("Force cooling");
            accessory.storage.setItem(accessory.name, "COOL");
            accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.COOL);;
            accessory._setTargetCoolingOverlay();
            break;

        case Characteristic.TargetHeatingCoolingState.AUTO:
            accessory.log("Automatic control");
            accessory.storage.setItem(accessory.name, "AUTO");
            accessory._setOverlay(null);
            accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.AUTO);  
            accessory.service.setCharacteristic(Characteristic.TargetTemperature, null); 
            break;
            
        case false:
            accessory.log("Set target state to off");
 
            var body = {
                "termination": {
                    "type": "MANUAL"
                },
                "setting": {
                    "power": "OFF",
                    "type": "AIR_CONDITIONING"
                }
            };
            accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.OFF);        
            accessory._setOverlay(body);
            break;
            
        case true:
            switch (accessory.lastMode)  {
                case "OFF":
                    accessory.log("Set target state to off");

                    var body = {
                        "termination": {
                            "type": "MANUAL"
                        },
                        "setting": {
                            "power": "OFF",
                            "type": "AIR_CONDITIONING"
                        }
                    };
                    accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.OFF);        
                    accessory._setOverlay(body);
                    break;

                case "HEAT":
                    accessory.log("Force heating");
                    accessory.storage.setItem(accessory.name, "HEAT");
                    accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.HEAT);
                    accessory._setTargetHeatingOverlay();
                    break;

                case "COOL":
                    accessory.log("Force cooling");
                    accessory.storage.setItem(accessory.name, "COOL");
                    accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.COOL);;
                    accessory._setTargetCoolingOverlay();
                    break;

                case "AUTO":
                    accessory.log("Automatic control");
                    accessory.storage.setItem(accessory.name, "AUTO");
                    accessory._setOverlay(null);
                    accessory.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, Characteristic.CurrentHeatingCoolingState.AUTO);  
                    accessory.service.setCharacteristic(Characteristic.TargetTemperature, null); 
                    break;

            }     
            break;
            
    }
    callback(null);
}

TadoAccessory.prototype.getCurrentTemperature = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);

            if (accessory.useFahrenheit) {
                accessory.log("Room temperature is " + obj.sensorDataPoints.insideTemperature.fahrenheit + "ºF");
                callback(null, obj.sensorDataPoints.insideTemperature.fahrenheit);
            } else {
                accessory.log("Room temperature is " + obj.sensorDataPoints.insideTemperature.celsius + "ºC");
                callback(null, obj.sensorDataPoints.insideTemperature.celsius);
            }
        });
    });
}

TadoAccessory.prototype.getTargetTemperature = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);

            if (obj.setting.temperature == null) {
                    accessory.log("Target temperature is unavailable");

                    callback(null, accessory.targetTemp);
                    return;
            }

            if (accessory.useFahrenheit) {
                    accessory.log("Target temperature is " + obj.setting.temperature.fahrenheit + "ºF");
                    accessory.targetTemp = obj.setting.temperature.fahrenheit;

                    callback(null, obj.setting.temperature.fahrenheit);
            } else {
                    accessory.log("Target temperature is " + obj.setting.temperature.celsius + "ºC");
                    accessory.targetTemp = obj.setting.temperature.celsius;

                    callback(null, obj.setting.temperature.celsius);
            }
        });
    });
}

TadoAccessory.prototype.setTargetTemperature = function(temp, callback) {
    var accessory = this;
    accessory.log("Set target temperature to " + temp + "º");
    accessory.targetTemp = temp;
    accessory.log("last Mode: " + accessory.lastMode);
    switch (accessory.lastMode) {
        case "COOL":
            accessory._setTargetCoolingOverlay();
            break;

        case "HEAT":
            accessory._setTargetHeatingOverlay();
            break;
    }

    callback(null);
}

TadoAccessory.prototype.getTemperatureDisplayUnits = function(callback) {
    var accessory = this;
    accessory.log("The current temperature display unit is " + (accessory.useFahrenheit ? "ºF" : "ºC"));
    callback(null, accessory.useFahrenheit ? Characteristic.TemperatureDisplayUnits.FAHRENHEIT : Characteristic.TemperatureDisplayUnits.CELSIUS);
}

TadoAccessory.prototype.getCurrentRelativeHumidity = function(callback) {
    var accessory = this;

    accessory._getCurrentStateResponse(function(response) {
        var str = '';

        //another chunk of data has been recieved, so append it to `str`
        response.on('data', function(chunk) {
            str += chunk;
        });

        //the whole response has been recieved, so we just print it out here
        response.on('end', function() {
            var obj = JSON.parse(str);
            accessory.log("Humidity is " + obj.sensorDataPoints.humidity.percentage + "%");
            callback(null, obj.sensorDataPoints.humidity.percentage);
        });
    });
}


TadoAccessory.prototype._getCurrentStateResponse = function(callback) {
    var accessory = this;
    accessory.log("Getting target state");

    var options = {
        host: 'my.tado.com',
        path: '/api/v2/homes/' + accessory.homeID + '/zones/' + accessory.zone + '/state?username=' + accessory.username + '&password=' + accessory.password
    };

    https.request(options, callback).end();
}

TadoAccessory.prototype._setOverlay = function(body) {
    var accessory = this;
    accessory.log("Setting new overlay");
    
    var options = {
        host: 'my.tado.com',
        path: '/api/v2/homes/' + accessory.homeID + '/zones/' + accessory.zone + '/overlay?username=' + accessory.username + '&password=' + accessory.password,
        method: body == null ? 'DELETE' : 'PUT'
    };
    
    if (body != null) {
        body = JSON.stringify(body);
        accessory.log("zone: " + accessory.zone + ",  body: " + body);
    }
    
    https.request(options, null).end(body);
    
    if (body == null) {
        accessory.service.setCharacteristic(Characteristic.TargetTemperature, null); 
    }
}

TadoAccessory.prototype._setTargetCoolingOverlay = function() {
    var body = {
        "termination": {
            "type": "MANUAL"
        },
        "setting": {
            "power": "ON",
            "type": "AIR_CONDITIONING",
            "mode": "COOL",
            "temperature": {}
        } 
    };
    if (this.useFahrenheit) {
        body.setting.temperature.fahrenheit = this.targetTemp;
    } else {
        body.setting.temperature.celsius = this.targetTemp;
    }
    if (this.useFanSpeed){
        body.setting.fanSpeed = this.useFanSpeed;
    }
    if (this.useSwing){
        body.setting.swing = this.useSwing;
    }
    this._setOverlay(body);
}

TadoAccessory.prototype._setTargetHeatingOverlay = function() {
    var body = {
        "termination": {
            "type": "MANUAL"
        },
        "setting": {
            "power": "ON",
            "type": "AIR_CONDITIONING",
            "mode": "HEAT",
            "temperature": {}
        }
    };
    if (this.useFahrenheit) {
        body.setting.temperature.fahrenheit = this.targetTemp;
    } else {
        body.setting.temperature.celsius = this.targetTemp;
    }
    if (this.useFanSpeed){
        body.setting.fanSpeed = this.useFanSpeed;
    }
    if (this.useSwing){
        body.setting.swing = this.useSwing;
    }
    this._setOverlay(body);
}

