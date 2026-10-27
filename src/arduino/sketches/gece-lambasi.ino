// Gece lambası: LDR ile 10 kΩ'luk direnç bir gerilim bölücü kurar (LDR üstte, direnç altta).
// Karanlıkta LDR'nin direnci büyür, A0'daki gerilim düşer; okunan değer eşiğin altına inince
// D13'teki LED yanar.
const int LDR_PIN = A0;
const int LED_PIN = 13;
const int THRESHOLD = 300;

void setup() {
  Serial.begin(9600);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  int light = analogRead(LDR_PIN);
  digitalWrite(LED_PIN, light < THRESHOLD ? HIGH : LOW);
  Serial.print("Işık: ");
  Serial.print(light);
  Serial.println(light < THRESHOLD ? "  (karanlık, lamba açık)" : "  (aydınlık)");
  delay(250);
}
