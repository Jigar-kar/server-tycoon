import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";

export function createHuman(
  mainColorHex,
  secondaryColorHex,
  hasBackpack,
  skinHex = 0xffdcb3, // Kept for compatibility, but not used for robot
) {
  const group = new THREE.Group();

  const chassisColor = mainColorHex ?? 0x4f53d9;
  const lowerColor = secondaryColorHex ?? chassisColor;

  // High-End Robot Materials
  const matChassis = new THREE.MeshStandardMaterial({
    color: chassisColor,
    metalness: 0.8,
    roughness: 0.3
  });

  const matLower = new THREE.MeshStandardMaterial({
    color: lowerColor,
    metalness: 0.9,
    roughness: 0.4
  });

  const matJoints = new THREE.MeshStandardMaterial({
    color: 0x111111,
    metalness: 1.0,
    roughness: 0.2
  });

  const matVisor = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    emissive: 0x00aaff,
    emissiveIntensity: 0.8,
    metalness: 0.9,
    roughness: 0.1
  });

  const matGlow = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const matThruster = new THREE.MeshBasicMaterial({ color: 0xff5500 });

  // Helper for limbs
  const createLimb = (radTop, radBot, len, mat, py) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radTop, radBot, len, 16),
      mat,
    );
    mesh.position.y = py;
    mesh.castShadow = true;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    return { pivot, mesh };
  };

  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 2.25;

  // Layered Torso (Armor Plates)
  const chestPlate = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 1.1, 1.0),
    matChassis,
  );
  chestPlate.position.set(0, 1.3, 0);
  chestPlate.castShadow = true;
  chestPlate.userData.tintGroup = "outfit";
  torsoGroup.add(chestPlate);

  const abdomen = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.7, 0.85),
    matLower,
  );
  abdomen.position.set(0, 0.4, 0);
  abdomen.castShadow = true;
  abdomen.userData.tintGroup = "outfit";
  torsoGroup.add(abdomen);

  // Glowing Chest Core
  const coreOuter = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 16, 32), matJoints);
  coreOuter.position.set(0, 1.3, 0.51);
  torsoGroup.add(coreOuter);

  const coreInner = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), matGlow);
  coreInner.position.set(0, 1.3, 0.51);
  coreInner.scale.z = 0.5; // flatten
  torsoGroup.add(coreInner);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16), matJoints);
  neck.position.y = 1.95;
  torsoGroup.add(neck);

  // Robot Head (Sleek curve)
  const headGroup = new THREE.Group();
  headGroup.position.y = 2.45;

  const headMain = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.8, 0.9),
    matChassis,
  );
  headMain.castShadow = true;
  headGroup.add(headMain);

  // Curved Visor (Daft Punk style)
  const visorGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.35, 32, 1, false, -Math.PI / 1.8, Math.PI * 1.1);
  const visor = new THREE.Mesh(visorGeo, matVisor);
  visor.position.set(0, 0.05, 0);
  headGroup.add(visor);

  // Head Antenna Details
  const antennaBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4), matJoints);
  antennaBase.position.set(0.3, 0.5, -0.3);
  antennaBase.rotation.x = -Math.PI / 8;
  headGroup.add(antennaBase);

  const antennaTip = new THREE.Mesh(new THREE.SphereGeometry(0.08), matGlow);
  antennaTip.position.set(0.3, 0.7, -0.38);
  headGroup.add(antennaTip);

  // Ear Modules
  const earGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
  earGeo.rotateZ(Math.PI / 2);
  const lEar = new THREE.Mesh(earGeo, matJoints);
  lEar.position.set(-0.48, 0, 0);
  headGroup.add(lEar);

  const rEar = new THREE.Mesh(earGeo, matJoints);
  rEar.position.set(0.48, 0, 0);
  headGroup.add(rEar);

  torsoGroup.add(headGroup);

  // --- Limbs & Joints --- //

  // Shoulders
  const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), matJoints);
  lShoulder.position.set(-0.85, 1.5, 0);
  torsoGroup.add(lShoulder);

  const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), matJoints);
  rShoulder.position.set(0.85, 1.5, 0);
  torsoGroup.add(rShoulder);

  // Hips
  const lHip = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), matJoints);
  lHip.position.set(-0.35, 0, 0);
  torsoGroup.add(lHip);

  const rHip = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 16), matJoints);
  rHip.position.set(0.35, 0, 0);
  torsoGroup.add(rHip);

  // Robot Legs
  const lLeg = createLimb(0.22, 0.18, 2.05, matLower, -1.03);
  lLeg.pivot.position.set(-0.35, 0, 0);
  lLeg.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(lLeg.pivot);

  const rLeg = createLimb(0.22, 0.18, 2.05, matLower, -1.03);
  rLeg.pivot.position.set(0.35, 0, 0);
  rLeg.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(rLeg.pivot);

  // Robot Feet (Sleek Boots)
  const buildFoot = (x) => {
    const footGroup = new THREE.Group();
    footGroup.position.set(x, -1.8, 0.1);

    // Main boot
    const footMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.35, 0.8),
      matChassis,
    );
    footMesh.castShadow = true;
    footGroup.add(footMesh);

    // Toe cap
    const toeMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.5, 16),
      matJoints
    );
    toeMesh.rotation.z = Math.PI / 2;
    toeMesh.position.set(0, 0, 0.4);
    footGroup.add(toeMesh);

    torsoGroup.add(footGroup);
  };

  buildFoot(-0.35);
  buildFoot(0.35);

  // Robot Arms 
  const lArm = createLimb(0.2, 0.16, 1.65, matChassis, -0.84);
  lArm.pivot.position.set(-0.85, 1.5, 0);
  lArm.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(lArm.pivot);

  const rArm = createLimb(0.2, 0.16, 1.65, matChassis, -0.84);
  rArm.pivot.position.set(0.85, 1.5, 0);
  rArm.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(rArm.pivot);

  lArm.pivot.rotation.z = Math.PI * 0.12;
  rArm.pivot.rotation.z = -Math.PI * 0.12;

  // Mechanical Hands (Claws)
  const buildHand = (armPivot) => {
    const handGroup = new THREE.Group();
    handGroup.position.y = -1.75;

    // Palm
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.15), matJoints);
    handGroup.add(palm);

    // Fingers
    const fingerGeo = new THREE.CylinderGeometry(0.04, 0.03, 0.2, 8);
    const f1 = new THREE.Mesh(fingerGeo, matLower);
    f1.position.set(-0.06, -0.15, 0.05);
    handGroup.add(f1);

    const f2 = new THREE.Mesh(fingerGeo, matLower);
    f2.position.set(0.06, -0.15, 0.05);
    handGroup.add(f2);

    // Thumb
    const thumb = new THREE.Mesh(fingerGeo, matLower);
    thumb.position.set(-0.1, -0.05, -0.05);
    thumb.rotation.z = Math.PI / 4;
    handGroup.add(thumb);

    armPivot.add(handGroup);
  };

  buildHand(lArm.pivot);
  buildHand(rArm.pivot);

  // Jetpack (Backpack replacement)
  const flares = [];
  if (hasBackpack) {
    const jetpack = new THREE.Group();
    jetpack.position.set(0, 1.1, -0.65);

    // Main Pack
    const mainPack = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.8, 0.3),
      matChassis,
    );
    mainPack.castShadow = true;
    jetpack.add(mainPack);

    // Glowing Power Bar
    const powerBar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.05), matVisor);
    powerBar.position.set(0, 0.1, -0.16);
    jetpack.add(powerBar);

    // Thrusters
    const createThruster = (x) => {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.3, 16), matJoints);
      nozzle.position.set(x, -0.5, 0);
      jetpack.add(nozzle);

      const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.0, 0.6, 16), matThruster);
      flare.position.set(x, -0.8, 0);
      flare.material.transparent = true;
      flare.material.opacity = 0.8;
      jetpack.add(flare);
      flares.push(flare);
    };

    createThruster(-0.25);
    createThruster(0.25);

    torsoGroup.add(jetpack);
  }

  group.add(torsoGroup);

  group.userData = {
    lLeg: lLeg.pivot,
    rLeg: rLeg.pivot,
    lArm: lArm.pivot,
    rArm: rArm.pivot,
    torso: torsoGroup,
    flares: flares
  };
  return group;
}

export function updateCharacterAnim(charBase, speed, time) {
  let rig = charBase.userData;
  if (!rig.torso) return;

  // Animate Jetpack Flares
  if (rig.flares && rig.flares.length > 0) {
    const flarePulse = 0.7 + Math.sin(time * 30) * 0.3; // Rapid flicker
    const flareScale = speed > 0.05 ? 1.5 : 0.5; // Bigger when moving

    rig.flares.forEach(flare => {
      flare.scale.y = flareScale * flarePulse;
      flare.position.y = -0.65 - (flare.scale.y * 0.3); // Offset based on scale
    });
  }

  if (speed > 0.05) {
    const freq = time * 20; // Mechanical, rapid step rate
    const swing = Math.sin(freq) * 1.0;

    // Stiffer limb movement
    rig.lLeg.rotation.x = swing;
    rig.rLeg.rotation.x = -swing;
    rig.lArm.rotation.x = -swing * 0.8;
    rig.rArm.rotation.x = swing * 0.8;

    // Bouncy, hovering chassis movement
    rig.torso.position.y = 2.3 + Math.abs(Math.sin(freq)) * 0.15;
    rig.torso.rotation.y = Math.sin(freq * 0.5) * 0.08;
    rig.torso.rotation.z = Math.sin(freq) * 0.03;
  } else {
    // Idle Animation: Mechanical Hover
    const hoverFreq = time * 3;
    const hoverOffset = Math.sin(hoverFreq) * 0.08;

    rig.lLeg.rotation.x += (0 - rig.lLeg.rotation.x) * 0.3;
    rig.rLeg.rotation.x += (0 - rig.rLeg.rotation.x) * 0.3;

    // Arms slightly raised while hovering
    rig.lArm.rotation.x += (0.1 - rig.lArm.rotation.x) * 0.3;
    rig.rArm.rotation.x += (0.1 - rig.rArm.rotation.x) * 0.3;

    rig.torso.position.y += ((2.35 + hoverOffset) - rig.torso.position.y) * 0.2;
    rig.torso.rotation.y += (0 - rig.torso.rotation.y) * 0.2;

    if (rig.torso.rotation.z) {
      rig.torso.rotation.z += (0 - rig.torso.rotation.z) * 0.3;
    }
  }
}
