// PWM'den doğru gerilim: D9'un 490 Hz'lik PWM'i 10 kΩ ve 10 µF'lık bir alçak geçiren süzgeçten
// geçince kondansatörde neredeyse düz bir gerilim kalır: V ≈ 5 V · doluluk / 255.
// Doluluk her 3 saniyede bir değişir; osiloskopta A = pin, B = kondansatör.
const int PWM_PIN = 9;
const int duties[] = { 64, 128, 192, 255, 0 };

void setup() {
  Serial.begin(9600);
  pinMode(PWM_PIN, OUTPUT);
}

void loop() {
  for (int i = 0; i < 5; i++) {
    analogWrite(PWM_PIN, duties[i]);
    Serial.print("Doluluk ");
    Serial.print(duties[i]);
    Serial.print("/255 → beklenen ");
    Serial.print(5.0 * duties[i] / 255.0, 2);
    Serial.println(" V");
    delay(3000);
  }
}
