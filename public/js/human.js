import * as THREE from "https://unpkg.com/three@0.128.0/build/three.module.js";

export function createHuman(
  shirtHex,
  pantsHex,
  hasBackpack,
  skinHex = 0xffdcb3,
) {
  const group = new THREE.Group();

  const suitColor = shirtHex ?? 0x4f53d9;
  const matShirt = new THREE.MeshLambertMaterial({ color: suitColor });
  const matSkin = new THREE.MeshLambertMaterial({ color: skinHex });
  const matPants = new THREE.MeshLambertMaterial({
    color: pantsHex ?? suitColor,
  });
  const matHair = new THREE.MeshLambertMaterial({ color: 0x6b3d2a });
  const matEyeWhite = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  const matEyePupil = new THREE.MeshLambertMaterial({ color: 0x212121 });
  const matMouth = new THREE.MeshLambertMaterial({ color: 0xcf7f7f });
  const matShoeWhite = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const matShoeBlue = new THREE.MeshLambertMaterial({ color: suitColor });
  const matShoeMint = new THREE.MeshLambertMaterial({ color: 0x4fc3f7 });
  const matZip = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });
  const matBackpack = new THREE.MeshLambertMaterial({ color: 0x263238 });

  const createLimb = (radTop, radBot, len, mat, py) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radTop, radBot, len, 8),
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

  // Tracksuit jacket torso
  const torsoMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 1.9, 0.9),
    matShirt,
  );
  torsoMesh.position.y = 0.92;
  torsoMesh.castShadow = true;
  torsoMesh.userData.tintGroup = "outfit";
  torsoGroup.add(torsoMesh);

  const collarMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.42, 0.3, 12),
    matShirt,
  );
  collarMesh.position.y = 1.95;
  collarMesh.castShadow = true;
  collarMesh.userData.tintGroup = "outfit";
  torsoGroup.add(collarMesh);

  const zipperMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 1.7, 0.06),
    matZip,
  );
  zipperMesh.position.set(0, 0.9, 0.47);
  torsoGroup.add(zipperMesh);

  // Head + ears
  const headMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 18, 18),
    matSkin,
  );
  headMesh.position.y = 2.72;
  headMesh.castShadow = true;
  torsoGroup.add(headMesh);

  const earGeo = new THREE.SphereGeometry(0.12, 8, 8);
  const leftEar = new THREE.Mesh(earGeo, matSkin);
  leftEar.position.set(-0.62, 2.68, 0);
  torsoGroup.add(leftEar);
  const rightEar = new THREE.Mesh(earGeo, matSkin);
  rightEar.position.set(0.62, 2.68, 0);
  torsoGroup.add(rightEar);

  // Hair cap + tuft
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.64, 16, 16),
    matHair,
  );
  hairCap.position.set(0, 2.88, -0.03);
  hairCap.scale.set(1.0, 0.72, 1.0);
  hairCap.castShadow = true;
  torsoGroup.add(hairCap);

  const hairTuft = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.35, 10),
    matHair,
  );
  hairTuft.position.set(0.1, 3.28, 0.3);
  hairTuft.rotation.set(Math.PI * 0.18, 0, -Math.PI * 0.08);
  hairTuft.castShadow = true;
  torsoGroup.add(hairTuft);

  // Brows, eyes and mouth
  const browGeo = new THREE.BoxGeometry(0.2, 0.05, 0.05);
  const leftBrow = new THREE.Mesh(browGeo, matHair);
  leftBrow.position.set(-0.22, 2.9, 0.53);
  torsoGroup.add(leftBrow);
  const rightBrow = new THREE.Mesh(browGeo, matHair);
  rightBrow.position.set(0.22, 2.9, 0.53);
  torsoGroup.add(rightBrow);

  const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
  const leftEye = new THREE.Mesh(eyeGeo, matEyeWhite);
  leftEye.position.set(-0.2, 2.74, 0.56);
  torsoGroup.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, matEyeWhite);
  rightEye.position.set(0.2, 2.74, 0.56);
  torsoGroup.add(rightEye);

  const pupilGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const leftPupil = new THREE.Mesh(pupilGeo, matEyePupil);
  leftPupil.position.set(-0.2, 2.73, 0.61);
  torsoGroup.add(leftPupil);
  const rightPupil = new THREE.Mesh(pupilGeo, matEyePupil);
  rightPupil.position.set(0.2, 2.73, 0.61);
  torsoGroup.add(rightPupil);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.06, 0.05),
    matMouth,
  );
  mouth.position.set(0, 2.48, 0.58);
  torsoGroup.add(mouth);

  group.add(torsoGroup);

  // Tracksuit pants
  const lLeg = createLimb(0.29, 0.24, 2.05, matPants, -1.03);
  lLeg.pivot.position.set(-0.31, 0, 0);
  lLeg.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(lLeg.pivot);

  const rLeg = createLimb(0.29, 0.24, 2.05, matPants, -1.03);
  rLeg.pivot.position.set(0.31, 0, 0);
  rLeg.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(rLeg.pivot);

  const buildShoe = (x) => {
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(x, -1.67, 0.05);

    const sole = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.14, 0.78),
      matShoeWhite,
    );
    sole.castShadow = true;
    shoeGroup.add(sole);

    const upper = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.2, 0.72),
      matShoeBlue,
    );
    upper.position.y = 0.14;
    upper.castShadow = true;
    shoeGroup.add(upper);

    const lace = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.03, 0.26),
      matShoeMint,
    );
    lace.position.set(0, 0.26, 0.12);
    shoeGroup.add(lace);

    torsoGroup.add(shoeGroup);
  };

  buildShoe(-0.31);
  buildShoe(0.31);

  // Sleeves + hands
  const lArm = createLimb(0.21, 0.16, 1.65, matShirt, -0.84);
  lArm.pivot.position.set(-0.84, 1.5, 0);
  lArm.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(lArm.pivot);

  const rArm = createLimb(0.21, 0.16, 1.65, matShirt, -0.84);
  rArm.pivot.position.set(0.84, 1.5, 0);
  rArm.mesh.userData.tintGroup = "outfit";
  torsoGroup.add(rArm.pivot);

  lArm.pivot.rotation.z = Math.PI * 0.08;
  rArm.pivot.rotation.z = -Math.PI * 0.08;

  const handGeo = new THREE.SphereGeometry(0.16, 10, 10);
  const lHand = new THREE.Mesh(handGeo, matSkin);
  lHand.position.y = -0.98;
  lArm.pivot.add(lHand);
  lHand.castShadow = true;

  const rHand = new THREE.Mesh(handGeo, matSkin);
  rHand.position.y = -0.98;
  rArm.pivot.add(rHand);
  rHand.castShadow = true;

  if (hasBackpack) {
    const backpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 1.1, 0.34),
      matBackpack,
    );
    backpack.position.set(0, 0.85, -0.63);
    backpack.castShadow = true;
    torsoGroup.add(backpack);
  }

  group.userData = {
    lLeg: lLeg.pivot,
    rLeg: rLeg.pivot,
    lArm: lArm.pivot,
    rArm: rArm.pivot,
    torso: torsoGroup,
  };
  return group;
}

export function updateCharacterAnim(charBase, speed, time) {
  let rig = charBase.userData;
  if (!rig.torso) return;

  if (speed > 0.05) {
    const freq = time * 18;
    const swing = Math.sin(freq) * 1.0;
    rig.lLeg.rotation.x = swing;
    rig.rLeg.rotation.x = -swing;
    rig.lArm.rotation.x = -swing;
    rig.rArm.rotation.x = swing;

    rig.torso.position.y = 2.25 + Math.abs(Math.sin(freq)) * 0.22;
  } else {
    rig.lLeg.rotation.x += (0 - rig.lLeg.rotation.x) * 0.2;
    rig.rLeg.rotation.x += (0 - rig.rLeg.rotation.x) * 0.2;
    rig.lArm.rotation.x += (0 - rig.lArm.rotation.x) * 0.2;
    rig.rArm.rotation.x += (0 - rig.rArm.rotation.x) * 0.2;
    rig.torso.position.y += (2.25 - rig.torso.position.y) * 0.2;
  }
}
