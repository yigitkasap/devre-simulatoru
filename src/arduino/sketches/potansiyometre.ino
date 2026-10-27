// Potansiyometreyle parlaklık: A0'daki gerilim (0–5 V) analogRead ile 0–1023 arası bir sayıya
// çevrilir, LED'in PWM değerine (0–255) ölçeklenir ve Seri ekrana yazılır.
const int POT_PIN = A0;
const int LED_PIN = 9;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int reading = analogRead(POT_PIN);
  int brightness = map(reading, 0, 1023, 0, 255);
  analogWrite(LED_PIN, brightness);
  Serial.print("A0 = ");
  Serial.print(reading);
  Serial.print("  (");
  Serial.print(reading * 5.0 / 1024.0, 2);
  Serial.print(" V)  PWM = ");
  Serial.println(brightness);
  delay(200);
}
