// Nefes alan LED: analogWrite ile D9'daki LED'in parlaklığı yavaşça artar ve azalır.
// analogWrite gerçek bir analog gerilim üretmez: pin 490 Hz'lik bir kare dalga verir. Doluluk
// oranı (0–255) LED'in ortalama akımını, yani parlaklığını belirler.
const int LED_PIN = 9;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  for (int value = 0; value <= 255; value += 5) {
    analogWrite(LED_PIN, value);
    delay(30);
  }
  for (int value = 255; value >= 0; value -= 5) {
    analogWrite(LED_PIN, value);
    delay(30);
  }
}
