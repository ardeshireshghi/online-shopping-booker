const player = require('play-sound')();

const playAudio = audioFile => new Promise((resolve, reject) => {
  player.play(audioFile, err => {
    if (err) return reject(err);
    resolve();
  });
});

exports.play = async (pathToAudioFile, {repeat = 1} = {}) => {
  let i = 0;

  while(i++ < repeat) {
    await playAudio(pathToAudioFile);
  }
};
