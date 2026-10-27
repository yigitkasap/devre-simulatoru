// Röleyle lamba: Arduino'nun pini 12 V'luk röle sargısını doğrudan süremez (sargı 44 mA ister,
// pin en çok 40 mA verir ve 5 V'tur). D7, 1 kΩ üzerinden bir NPN transistörü açar; transistör
// sargıyı 12 V'a bağlar. Ters paralel diyot, sargı kesilince oluşan gerilim sıçramasını yutar.
const int RELAY_PIN = 7;

void setup() {
  Serial.begin(9600);
  pinMode(RELAY_PIN, OUTPUT);
}

void loop() {
  digitalWrite(RELAY_PIN, HIGH);
  Serial.println("Röle çekti: lamba yanıyor");
  delay(2000);
  digitalWrite(RELAY_PIN, LOW);
  Serial.println("Röle bıraktı: lamba sönük");
  delay(2000);
}
