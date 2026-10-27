// Düğme sayacı: D2'deki düğmeye her basışta sayı bir artar ve Seri ekrana yazılır.
// Basış, pinin HIGH'dan LOW'a geçtiği an (düşen kenar) olarak sayılır.
const int BUTTON_PIN = 2;
int count = 0;
bool wasPressed = false;

void setup() {
  Serial.begin(9600);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.println("Düğmeye bas!");
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  if (pressed && !wasPressed) {
    count++;
    Serial.print("Basış sayısı: ");
    Serial.println(count);
  }
  wasPressed = pressed;
  delay(5);
}
