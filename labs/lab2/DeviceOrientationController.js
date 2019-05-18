/**
 * -------
 * threeVR (https://github.com/richtr/threeVR)
 * -------
 *
 * W3C Device Orientation control (http://www.w3.org/TR/orientation-event/)
 * with manual user drag (rotate) and pinch (zoom) override handling
 *
 * Author: Rich Tibbett (http://github.com/richtr)
 * License: The MIT License
 *
 **/

var DeviceOrientationController = function(object, domElement) {
  this.object = object;
  this.element = domElement || document;

  this.freeze = true;

  this.enableManualDrag = true; // enable manual user drag override control by default
  this.enableManualZoom = true; // enable manual user zoom override control by default

  this.useQuaternions = false; // use quaternions for orientation calculation by default

  this.deviceOrientation = {};
  this.screenOrientation = window.orientation || 0;

  // Manual rotate override components
  var startX = 0,
    startY = 0,
    currentX = 0,
    currentY = 0,
    scrollSpeedX,
    scrollSpeedY,
    tmpQuat = new THREE.Quaternion();

  // Manual zoom override components
  var zoomStart = 1,
    zoomCurrent = 1,
    zoomP1 = new THREE.Vector2(),
    zoomP2 = new THREE.Vector2(),
    tmpFOV;

  var CONTROLLER_STATE = {
    AUTO: 0,
    MANUAL_ROTATE: 1,
    MANUAL_ZOOM: 2
  };

  var appState = CONTROLLER_STATE.AUTO;

  var CONTROLLER_EVENT = {
    CALIBRATE_COMPASS: "compassneedscalibration",
    SCREEN_ORIENTATION: "orientationchange",
    MANUAL_CONTROL: "userinteraction", // userinteractionstart, userinteractionend
    ZOOM_CONTROL: "zoom", // zoomstart, zoomend
    ROTATE_CONTROL: "rotate" // rotatestart, rotateend
  };

  // Consistent Object Field-Of-View fix components
  var startClientHeight = window.innerHeight,
    startFOVFrustrumHeight =
      2000 * Math.tan(THREE.Math.degToRad((this.object.fov || 75) / 2)),
    relativeFOVFrustrumHeight,
    relativeVerticalFOV;

  var deviceQuat = new THREE.Quaternion();

  var fireEvent = function() {
    var eventData;

    return function(name) {
      eventData = arguments || {};

      eventData.type = name;
      eventData.target = this;

      this.dispatchEvent(eventData);
    }.bind(this);
  }.bind(this)();

  this.constrainObjectFOV = function() {
    relativeFOVFrustrumHeight =
      startFOVFrustrumHeight * (window.innerHeight / startClientHeight);

    relativeVerticalFOV = THREE.Math.radToDeg(
      2 * Math.atan(relativeFOVFrustrumHeight / 2000)
    );

    this.object.fov = relativeVerticalFOV;
  }.bind(this);

  this.onDeviceOrientationChange = function(event) {
    this.deviceOrientation = event;
  }.bind(this);

  this.onScreenOrientationChange = function() {
    this.screenOrientation = window.orientation || 0;

    fireEvent(CONTROLLER_EVENT.SCREEN_ORIENTATION);
  }.bind(this);

  this.onCompassNeedsCalibration = function(event) {
    event.preventDefault();

    fireEvent(CONTROLLER_EVENT.CALIBRATE_COMPASS);
  }.bind(this);

  var createQuaternion = (function() {
    var finalQuaternion = new THREE.Quaternion();

    var deviceEuler = new THREE.Euler();

    var screenTransform = new THREE.Quaternion();

    var worldTransform = new THREE.Quaternion(
      -Math.sqrt(0.5),
      0,
      0,
      Math.sqrt(0.5)
    ); // - PI/2 around the x-axis

    var minusHalfAngle = 0;

    return function(alpha, beta, gamma, screenOrientation) {
      deviceEuler.set(beta, alpha, -gamma, "YXZ");

      finalQuaternion.setFromEuler(deviceEuler);

      minusHalfAngle = -screenOrientation / 2;

      screenTransform.set(
        0,
        Math.sin(minusHalfAngle),
        0,
        Math.cos(minusHalfAngle)
      );

      finalQuaternion.multiply(screenTransform);

      finalQuaternion.multiply(worldTransform);

      return finalQuaternion;
    };
  })();

  var createRotationMatrix = (function() {
    var finalMatrix = new THREE.Matrix4();

    var deviceEuler = new THREE.Euler();
    var screenEuler = new THREE.Euler();
    var worldEuler = new THREE.Euler(-Math.PI / 2, 0, 0, "YXZ"); // - PI/2 around the x-axis

    var screenTransform = new THREE.Matrix4();

    var worldTransform = new THREE.Matrix4();
    worldTransform.makeRotationFromEuler(worldEuler);

    return function(alpha, beta, gamma, screenOrientation) {
      deviceEuler.set(beta, alpha, -gamma, "YXZ");

      finalMatrix.identity();

      finalMatrix.makeRotationFromEuler(deviceEuler);

      screenEuler.set(0, -screenOrientation, 0, "YXZ");

      screenTransform.identity();

      screenTransform.makeRotationFromEuler(screenEuler);

      finalMatrix.multiply(screenTransform);

      finalMatrix.multiply(worldTransform);

      return finalMatrix;
    };
  })();

  this.updateDeviceMove = (function() {
    var alpha, beta, gamma, orient;

    var deviceMatrix;

    return function() {
      alpha = THREE.Math.degToRad(this.deviceOrientation.alpha || 0); // Z
      beta = THREE.Math.degToRad(this.deviceOrientation.beta || 0); // X'
      gamma = THREE.Math.degToRad(this.deviceOrientation.gamma || 0); // Y''
      orient = THREE.Math.degToRad(this.screenOrientation || 0); // O

      // only process non-zero 3-axis data
      if (alpha !== 0 && beta !== 0 && gamma !== 0) {
        if (this.useQuaternions) {
          deviceQuat = createQuaternion(alpha, beta, gamma, orient);
        } else {
          deviceMatrix = createRotationMatrix(alpha, beta, gamma, orient);

          deviceQuat.setFromRotationMatrix(deviceMatrix);
        }

        if (this.freeze) return;

        //this.object.quaternion.slerp( deviceQuat, 0.07 ); // smoothing
        this.object.quaternion.copy(deviceQuat);
      }
    };
  })();

  this.update = function() {
    this.updateDeviceMove();

    if (appState !== CONTROLLER_STATE.AUTO) {
      this.updateManualMove();
    }
  };

  this.connect = function() {
    window.addEventListener("resize", this.constrainObjectFOV, false);

    window.addEventListener(
      "orientationchange",
      this.onScreenOrientationChange,
      false
    );
    window.addEventListener(
      "deviceorientation",
      this.onDeviceOrientationChange,
      false
    );

    window.addEventListener(
      "compassneedscalibration",
      this.onCompassNeedsCalibration,
      false
    );

    this.freeze = false;
  };

  this.disconnect = function() {
    this.freeze = true;

    window.removeEventListener("resize", this.constrainObjectFOV, false);

    window.removeEventListener(
      "orientationchange",
      this.onScreenOrientationChange,
      false
    );
    window.removeEventListener(
      "deviceorientation",
      this.onDeviceOrientationChange,
      false
    );

    window.removeEventListener(
      "compassneedscalibration",
      this.onCompassNeedsCalibration,
      false
    );
  };
};

DeviceOrientationController.prototype = Object.create(
  THREE.EventDispatcher.prototype
);
