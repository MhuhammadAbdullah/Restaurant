const RAW = [
  // Punjab
  "Lahore", "Faisalabad", "Rawalpindi", "Gujranwala", "Multan", "Sialkot", "Bahawalpur", "Sargodha", "Sheikhupura", "Rahim Yar Khan",
  "Jhang", "Dera Ghazi Khan", "Gujrat", "Sahiwal", "Wah Cantonment", "Kasur", "Okara", "Chiniot", "Kamoke", "Hafizabad",
  "Sadiqabad", "Burewala", "Khanewal", "Muzaffargarh", "Mandi Bahauddin", "Jhelum", "Khanpur", "Pakpattan", "Daska", "Gojra",
  "Muridke", "Bahawalnagar", "Samundri", "Jaranwala", "Chishtian", "Attock", "Vehari", "Kot Abdul Malik", "Ferozwala", "Chakwal",
  "Gujranwala Cantonment", "Kamalia", "Ahmedpur East", "Kot Addu", "Wazirabad", "Layyah", "Taxila", "Khushab", "Mianwali", "Kabirwala",
  "Lodhran", "Hasilpur", "Bhakkar", "Arifwala", "Sambrial", "Haroonabad", "Narowal", "Bhalwal", "Murree", "Rajanpur",
  "Toba Tek Singh", "Jauharabad", "Pattoki", "Chunian", "Dina", "Ghakhar", "Pindi Bhattian", "Pir Mahal", "Phalia", "Sillanwali",
  "Shorkot", "Shujabad", "Jalalpur Pirwala", "Liaquatpur", "Khairpur Tamewali", "Fort Abbas", "Yazman", "Ahmadpur Sial", "Alipur", "Jatoi",
  "Mailsi", "Kahror Pacca", "Dunyapur", "Qaimpur", "Chichawatni", "Harappa", "Renala Khurd", "Depalpur", "Hujra Shah Muqeem", "Mian Channu",
  "Tandlianwala", "Gojra", "Kamar Mushani", "Piplan", "Talagang", "Fateh Jang", "Hasan Abdal", "Gujar Khan", "Kallar Syedan", "Kharian",
  "Lalamusa", "Sarai Alamgir", "Dinga", "Malakwal", "Pind Dadan Khan", "Sohawa", "Choa Saidanshah", "Kundian", "Isa Khel", "Nankana Sahib",
  "Sangla Hill", "Safdarabad", "Bhera", "Shahpur", "Sillanwali", "Hazro", "Jand", "Pindi Gheb", "Ludhewala Waraich", "Ranipur",
  "Pasrur", "Zafarwal", "Shakargarh", "Gakhar Mandi", "Rabwah", "Kot Radha Kishan", "Raiwind", "Bahria Town Lahore", "DHA Lahore", "Model Town Lahore",
  // Sindh
  "Karachi", "Hyderabad", "Sukkur", "Larkana", "Nawabshah", "Mirpur Khas", "Jacobabad", "Shikarpur", "Khairpur", "Dadu",
  "Kotri", "Tando Allahyar", "Tando Adam", "Umerkot", "Ghotki", "Daharki", "Badin", "Thatta", "Sanghar", "Jamshoro",
  "Naushahro Feroze", "Tando Muhammad Khan", "Kandhkot", "Kamber", "Mirpur Mathelo", "Shahdadkot", "Moro", "Rohri", "Sehwan", "Matiari",
  "Hala", "Tharparkar", "Mithi", "Kashmore", "Ratodero", "Warah", "Johi", "Digri", "Pano Aqil", "Gambat",
  "Sakrand", "Dokri", "Shahdadpur", "Tando Bago", "Jati", "Keti Bandar", "Gulshan-e-Iqbal Karachi", "Malir Karachi", "Landhi Karachi", "Korangi Karachi",
  // Khyber Pakhtunkhwa
  "Peshawar", "Mardan", "Mingora", "Abbottabad", "Kohat", "Dera Ismail Khan", "Mansehra", "Swabi", "Nowshera", "Charsadda",
  "Bannu", "Haripur", "Swat", "Chitral", "Timergara", "Batkhela", "Dir", "Buner", "Karak", "Hangu",
  "Lakki Marwat", "Tank", "Parachinar", "Kurram", "Thall", "Shabqadar", "Tangi", "Takht Bhai", "Risalpur", "Pabbi",
  "Kabal", "Matta", "Khwazakhela", "Barikot", "Alpuri", "Besham", "Balakot", "Oghi", "Havelian", "Nathia Gali",
  "Landi Kotal", "Jamrud", "Bara", "Miranshah", "Wana", "Khar", "Mohmand", "Kulachi", "Topi", "Ghazi",
  // Balochistan
  "Quetta", "Gwadar", "Turbat", "Khuzdar", "Chaman", "Sibi", "Zhob", "Hub", "Loralai", "Dera Murad Jamali",
  "Dera Allah Yar", "Usta Muhammad", "Jaffarabad", "Nasirabad", "Pishin", "Qila Saifullah", "Qila Abdullah", "Kalat", "Mastung", "Nushki",
  "Dalbandin", "Kharan", "Panjgur", "Ormara", "Pasni", "Jiwani", "Lasbela", "Uthal", "Bela", "Kech",
  "Awaran", "Washuk", "Ziarat", "Harnai", "Barkhan", "Kohlu", "Dera Bugti", "Sui", "Mach", "Bolan",
  // Islamabad / AJK / Gilgit-Baltistan
  "Islamabad", "Muzaffarabad", "Mirpur", "Kotli", "Bagh", "Rawalakot", "Bhimber", "Dadyal", "Neelum", "Athmuqam",
  "Gilgit", "Skardu", "Hunza", "Karimabad", "Ghizer", "Gupis", "Chilas", "Diamer", "Astore", "Ghanche",
  "Khaplu", "Nagar", "Aliabad", "Shigar", "Gahkuch",
];

/** Cities and towns of Pakistan (alphabetical, no duplicates), for pick-from-a-list city fields. */
export const PAKISTAN_CITIES: string[] = Array.from(new Set(RAW.map((c) => c.trim()))).sort((a, b) => a.localeCompare(b));
