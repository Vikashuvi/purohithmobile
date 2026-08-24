import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const CHIMES = [
  require("../../assets/sounds/chime-1.wav"), require("../../assets/sounds/chime-2.wav"),
  require("../../assets/sounds/chime-3.wav"), require("../../assets/sounds/chime-4.wav"),
  require("../../assets/sounds/chime-5.wav"), require("../../assets/sounds/chime-6.wav"),
  require("../../assets/sounds/chime-7.wav"), require("../../assets/sounds/chime-8.wav"),
  require("../../assets/sounds/chime-9.wav"), require("../../assets/sounds/chime-10.wav"),
  require("../../assets/sounds/chime-11.wav"), require("../../assets/sounds/chime-12.wav"),
];

let lastIndex = -1;

export async function spiritualTap() {
  try {
    if (Platform.OS !== "web") await Haptics.selectionAsync();
    let index = Math.floor(Math.random() * CHIMES.length);
    if (index === lastIndex) index = (index + 1) % CHIMES.length;
    lastIndex = index;
    const { sound } = await Audio.Sound.createAsync(CHIMES[index], { volume: 0.45 });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
    });
    await sound.playAsync();
  } catch (_) {
    // Audio and haptics are enhancement-only; navigation must always continue.
  }
}
