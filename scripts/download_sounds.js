const https = require('https');
const fs = require('fs');
const path = require('path');

const sounds = {
  walk: "https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3",
  collect: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3",
  purchase: "https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3",
  success: "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3",
  error: "https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3",
};

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
};

async function main() {
  const soundDir = path.join(__dirname, 'public', 'assets', 'sound');
  if (!fs.existsSync(soundDir)) fs.mkdirSync(soundDir, { recursive: true });

  for (const [name, url] of Object.entries(sounds)) {
    console.log(`Downloading ${name}...`);
    try {
      await download(url, path.join(soundDir, `${name}.mp3`));
      console.log(`Finished ${name}`);
    } catch (err) {
      console.error(`Error downloading ${name}: ${err.message}`);
    }
  }
}

main();
