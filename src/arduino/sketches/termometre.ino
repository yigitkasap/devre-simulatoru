// Termometre: 10 kΩ'luk direnç (üstte) ile 10 kΩ'luk NTC (altta) bir gerilim bölücüdür.
// Arduino okunan değerden NTC'nin direncini bulur ve B parametresi denklemiyle sıcaklığa çevirir:
//   1/T = 1/T25 + ln(R/R25) / B      (Vishay NTCLE100E3103: R25 = 10 kΩ, B = 3977 K)
const int NTC_PIN = A0;
const float SERIES = 10000.0;
const float R25 = 10000.0;
const float BETA = 3977.0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int code = analogRead(NTC_PIN);
  float resistance = SERIES * code / (1023.0 - code);
  float kelvin = 1.0 / (1.0 / 298.15 + log(resistance / R25) / BETA);
  Serial.print("NTC: ");
  Serial.print(resistance / 1000.0, 2);
  Serial.print(" kΩ   Sıcaklık: ");
  Serial.print(kelvin - 273.15, 1);
  Serial.println(" °C");
  delay(500);
}
