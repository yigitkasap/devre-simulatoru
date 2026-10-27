// ÜRETİLMİŞ DOSYA, elle değiştirme. Kaynak: src/arduino/sketches/*.ino; üretici: npm run arduino:derle
// (scripts/arduino/derle.mjs: avr-gcc WebAssembly, -Os, Arduino AVR çekirdeği 1.8.x).

export interface ProgramInfo {
  /** Flash'ta kapladığı bayt. */
  readonly flash: number;
  /** Arduino kodu (.ino). */
  readonly source: string;
}

export const PROGRAMS: Readonly<Record<string, ProgramInfo>> = {
  "blink": {
    flash: 2246,
    source: "// Yanıp sönen LED: D13'e bağlı LED yarım saniye yanar, yarım saniye söner.\nconst int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  delay(500);\n  digitalWrite(LED_PIN, LOW);\n  delay(500);\n}\n",
  },
  "dugme": {
    flash: 2338,
    source: "// Düğmeyle LED: D2'deki düğmeye basılınca D13'teki LED yanar.\n// INPUT_PULLUP: pin içerideki ≈ 35 kΩ'luk dirençle 5 V'a çekilir. Düğme pini GND'ye bağlar;\n// yani düğme basılıyken pin LOW, bırakılınca HIGH okunur.\nconst int BUTTON_PIN = 2;\nconst int LED_PIN = 13;\n\nvoid setup() {\n  pinMode(BUTTON_PIN, INPUT_PULLUP);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BUTTON_PIN) == LOW;\n  digitalWrite(LED_PIN, pressed ? HIGH : LOW);\n  delay(10);  // saniyede 100 kez okumak yeter: insan 10 ms'lik gecikmeyi fark etmez\n}\n",
  },
  "fade": {
    flash: 2470,
    source: "// Nefes alan LED: analogWrite ile D9'daki LED'in parlaklığı yavaşça artar ve azalır.\n// analogWrite gerçek bir analog gerilim üretmez: pin 490 Hz'lik bir kare dalga verir. Doluluk\n// oranı (0–255) LED'in ortalama akımını, yani parlaklığını belirler.\nconst int LED_PIN = 9;\n\nvoid setup() {\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  for (int value = 0; value <= 255; value += 5) {\n    analogWrite(LED_PIN, value);\n    delay(30);\n  }\n  for (int value = 255; value >= 0; value -= 5) {\n    analogWrite(LED_PIN, value);\n    delay(30);\n  }\n}\n",
  },
  "gece-lambasi": {
    flash: 3116,
    source: "// Gece lambası: LDR ile 10 kΩ'luk direnç bir gerilim bölücü kurar (LDR üstte, direnç altta).\n// Karanlıkta LDR'nin direnci büyür, A0'daki gerilim düşer; okunan değer eşiğin altına inince\n// D13'teki LED yanar.\nconst int LDR_PIN = A0;\nconst int LED_PIN = 13;\nconst int THRESHOLD = 300;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  int light = analogRead(LDR_PIN);\n  digitalWrite(LED_PIN, light < THRESHOLD ? HIGH : LOW);\n  Serial.print(\"Işık: \");\n  Serial.print(light);\n  Serial.println(light < THRESHOLD ? \"  (karanlık, lamba açık)\" : \"  (aydınlık)\");\n  delay(250);\n}\n",
  },
  "melodi": {
    flash: 3922,
    source: "// Melodi: tone() D8'den istenen frekansta kare dalga verir; hoparlör (seri 150 Ω ile) çalar.\n// Ezgi: \"Twinkle Twinkle Little Star\" (Fransız halk ezgisi, telifsiz).\nconst int SPEAKER = 8;\nconst int NOTE_C4 = 262, NOTE_D4 = 294, NOTE_E4 = 330, NOTE_F4 = 349, NOTE_G4 = 392, NOTE_A4 = 440;\nconst int melody[] = { NOTE_C4, NOTE_C4, NOTE_G4, NOTE_G4, NOTE_A4, NOTE_A4, NOTE_G4,\n                       NOTE_F4, NOTE_F4, NOTE_E4, NOTE_E4, NOTE_D4, NOTE_D4, NOTE_C4 };\nconst int beats[] = { 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2 };\nconst int BEAT_MS = 300;\n\nvoid setup() {\n}\n\nvoid loop() {\n  for (int i = 0; i < 14; i++) {\n    int duration = beats[i] * BEAT_MS;\n    tone(SPEAKER, melody[i], duration * 9 / 10);\n    delay(duration);\n  }\n  delay(1000);\n}\n",
  },
  "potansiyometre": {
    flash: 5352,
    source: "// Potansiyometreyle parlaklık: A0'daki gerilim (0–5 V) analogRead ile 0–1023 arası bir sayıya\n// çevrilir, LED'in PWM değerine (0–255) ölçeklenir ve Seri ekrana yazılır.\nconst int POT_PIN = A0;\nconst int LED_PIN = 9;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  int reading = analogRead(POT_PIN);\n  int brightness = map(reading, 0, 1023, 0, 255);\n  analogWrite(LED_PIN, brightness);\n  Serial.print(\"A0 = \");\n  Serial.print(reading);\n  Serial.print(\"  (\");\n  Serial.print(reading * 5.0 / 1024.0, 2);\n  Serial.print(\" V)  PWM = \");\n  Serial.println(brightness);\n  delay(200);\n}\n",
  },
  "pwm-filtre": {
    flash: 4958,
    source: "// PWM'den doğru gerilim: D9'un 490 Hz'lik PWM'i 10 kΩ ve 10 µF'lık bir alçak geçiren süzgeçten\n// geçince kondansatörde neredeyse düz bir gerilim kalır: V ≈ 5 V · doluluk / 255.\n// Doluluk her 3 saniyede bir değişir; voltmetre kondansatörün gerilimini gösterir.\nconst int PWM_PIN = 9;\nconst int duties[] = { 64, 128, 192, 255, 0 };\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(PWM_PIN, OUTPUT);\n}\n\nvoid loop() {\n  for (int i = 0; i < 5; i++) {\n    analogWrite(PWM_PIN, duties[i]);\n    Serial.print(\"Doluluk \");\n    Serial.print(duties[i]);\n    Serial.print(\"/255 → beklenen \");\n    Serial.print(5.0 * duties[i] / 255.0, 2);\n    Serial.println(\" V\");\n    delay(3000);\n  }\n}\n",
  },
  "role": {
    flash: 2698,
    source: "// Röleyle lamba: Arduino'nun pini 12 V'luk röle sargısını doğrudan süremez (sargı 44 mA ister,\n// pin en çok 40 mA verir ve 5 V'tur). D7, 1 kΩ üzerinden bir NPN transistörü açar; transistör\n// sargıyı 12 V'a bağlar. Ters paralel diyot, sargı kesilince oluşan gerilim sıçramasını yutar.\nconst int RELAY_PIN = 7;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(RELAY_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(RELAY_PIN, HIGH);\n  Serial.println(\"Röle çekti: lamba yanıyor\");\n  delay(2000);\n  digitalWrite(RELAY_PIN, LOW);\n  Serial.println(\"Röle bıraktı: lamba sönük\");\n  delay(2000);\n}\n",
  },
  "sayac": {
    flash: 3184,
    source: "// Düğme sayacı: D2'deki düğmeye her basışta sayı bir artar ve Seri ekrana yazılır.\n// Basış, pinin HIGH'dan LOW'a geçtiği an (düşen kenar) olarak sayılır.\nconst int BUTTON_PIN = 2;\nint count = 0;\nbool wasPressed = false;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(BUTTON_PIN, INPUT_PULLUP);\n  Serial.println(\"Düğmeye bas!\");\n}\n\nvoid loop() {\n  bool pressed = digitalRead(BUTTON_PIN) == LOW;\n  if (pressed && !wasPressed) {\n    count++;\n    Serial.print(\"Basış sayısı: \");\n    Serial.println(count);\n  }\n  wasPressed = pressed;\n  delay(5);\n}\n",
  },
  "termometre": {
    flash: 4988,
    source: "// Termometre: 10 kΩ'luk direnç (üstte) ile 10 kΩ'luk NTC (altta) bir gerilim bölücüdür.\n// Arduino okunan değerden NTC'nin direncini bulur ve B parametresi denklemiyle sıcaklığa çevirir:\n//   1/T = 1/T25 + ln(R/R25) / B      (Vishay NTCLE100E3103: R25 = 10 kΩ, B = 3977 K)\nconst int NTC_PIN = A0;\nconst float SERIES = 10000.0;\nconst float R25 = 10000.0;\nconst float BETA = 3977.0;\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int code = analogRead(NTC_PIN);\n  float resistance = SERIES * code / (1023.0 - code);\n  float kelvin = 1.0 / (1.0 / 298.15 + log(resistance / R25) / BETA);\n  Serial.print(\"NTC: \");\n  Serial.print(resistance / 1000.0, 2);\n  Serial.print(\" kΩ   Sıcaklık: \");\n  Serial.print(kelvin - 273.15, 1);\n  Serial.println(\" °C\");\n  delay(500);\n}\n",
  },
  "trafik-isigi": {
    flash: 2346,
    source: "// Trafik ışığı: kırmızı (D12), sarı (D11) ve yeşil (D10) LED'ler sırayla yanar.\nconst int RED = 12;\nconst int YELLOW = 11;\nconst int GREEN = 10;\n\nvoid lights(bool red, bool yellow, bool green) {\n  digitalWrite(RED, red ? HIGH : LOW);\n  digitalWrite(YELLOW, yellow ? HIGH : LOW);\n  digitalWrite(GREEN, green ? HIGH : LOW);\n}\n\nvoid setup() {\n  pinMode(RED, OUTPUT);\n  pinMode(YELLOW, OUTPUT);\n  pinMode(GREEN, OUTPUT);\n}\n\nvoid loop() {\n  lights(true, false, false);   // dur\n  delay(3000);\n  lights(true, true, false);    // hazırlan\n  delay(1000);\n  lights(false, false, true);   // geç\n  delay(3000);\n  lights(false, true, false);   // dikkat\n  delay(1000);\n}\n",
  },
};
