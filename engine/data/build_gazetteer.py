#!/usr/bin/env python3
"""Genera engine/data/gazetteer.json.

Sorgente curata a mano (righe DATA sotto) + centroidi calcolati da data/countries.geojson
(poligono piu' grande del paese). Rilanciare: ``python3 engine/data/build_gazetteer.py``.

Formato riga (campi separati da '|'):
  ISO|name_en|name_it|region|clat,clng(opzionale)|capitale|demonimi_en|demonimi_it|citta|alias|keywords

* capitale / citta:  ``En/It/alias..:lat:lng`` (citta separate da ';'). Un nome puo' avere ``~peso``.
* demonimi_it: parole in -o espanse in o/a/i/e, in -e in e/i; prefisso ``!`` = forme letterali.
* alias / keywords: lista separata da ','; prefisso ``=`` = case-sensitive; suffisso ``~0.5`` = peso.
* region: E europe, A americas, S asia, M middle_east, F africa, O oceania.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REG = {"E": "europe", "A": "americas", "S": "asia", "M": "middle_east", "F": "africa", "O": "oceania"}

DATA = r"""
AF|Afghanistan|Afghanistan|S||Kabul/Kabul:34.53:69.17|Afghan|afghano|Kandahar/Kandahar:31.62:65.71;Herat/Herat:34.35:62.2|Afghanistan|Taliban,Akhundzada,Bagram
AL|Albania|Albania|E||Tirana/Tirana:41.33:19.82|Albanian|albanese|Durres/Durazzo:41.32:19.45||
DZ|Algeria|Algeria|F||Algiers/Algeri:36.75:3.06|Algerian|algerino|Oran/Orano:35.7:-0.63||Tebboune
AD|Andorra|Andorra|E||Andorra la Vella:42.51:1.52|Andorran|andorrano|||
AO|Angola|Angola|F||Luanda/Luanda:-8.84:13.23|Angolan|angolano|Benguela/Benguela:-12.58:13.4||
AG|Antigua and Barbuda|Antigua e Barbuda|A||Saint John's/Saint John's/St John's:17.12:-61.85|Antiguan,Barbudan|antiguano|||
AR|Argentina|Argentina|A||Buenos Aires/Buenos Aires:-34.6:-58.38|Argentine,Argentinian|argentino|Rosario/Rosario~0.3:-32.95:-60.65||Milei,Casa Rosada,Merval
AM|Armenia|Armenia|S||Yerevan/Erevan:40.18:44.51|Armenian|armeno|Gyumri/Gyumri:40.79:43.85||Pashinyan
AU|Australia|Australia|O||Canberra/Canberra:-35.28:149.13|Australian|australiano|Sydney/Sydney:-33.87:151.21;Melbourne/Melbourne:-37.81:144.96;Perth/Perth:-31.95:115.86||Albanese,ASX
AT|Austria|Austria|E||Vienna/Vienna/Wien:48.21:16.37|Austrian|austriaco|Salzburg/Salisburgo:47.8:13.04||
AZ|Azerbaijan|Azerbaigian|S||Baku/Baku:40.41:49.87|Azerbaijani,Azeri|azero,azerbaigiano|Nagorno-Karabakh/Nagorno-Karabakh/Nagorno Karabakh/Karabakh/Artsakh:39.8:46.75|Azerbaijan,Azerbaigian,Azerbaijan|Aliyev
BS|Bahamas|Bahamas|A||Nassau/Nassau~0.5:25.05:-77.35|Bahamian|bahamense,bahamiano|||
BH|Bahrain|Bahrein|M||Manama/Manama:26.23:50.59|Bahraini|bahreinita|||
BD|Bangladesh|Bangladesh|S||Dhaka/Dacca:23.81:90.41|Bangladeshi|bangladese|Chittagong/Chittagong:22.36:91.78||Yunus~0.3,Hasina
BB|Barbados|Barbados|A||Bridgetown/Bridgetown:13.1:-59.61|Barbadian|barbadiano|||
BY|Belarus|Bielorussia|E||Minsk/Minsk:53.9:27.57|Belarusian,Belarussian|bielorusso|Brest/Brest-Litovsk~0.3:52.1:23.7|Belarus,Belorussia,Bielorussia|Lukashenko,Lukashenka
BE|Belgium|Belgio|E||Brussels/Bruxelles:50.85:4.35|Belgian|belga!belgi,belghe|Antwerp/Anversa:51.22:4.4|Belgio|
BZ|Belize|Belize|A||Belmopan/Belmopan:17.25:-88.77|Belizean|beliziano|||
BJ|Benin|Benin|F||Porto-Novo/Porto-Novo/Porto Novo:6.5:2.6|Beninese|beninese|Cotonou/Cotonou:6.37:2.39||
BT|Bhutan|Bhutan|S||Thimphu/Thimphu:27.47:89.64|Bhutanese|bhutanese|||
BO|Bolivia|Bolivia|A||La Paz/La Paz:-16.5:-68.15|Bolivian|boliviano|Santa Cruz de la Sierra/Santa Cruz de la Sierra:-17.78:-63.18;Sucre/Sucre:-19.04:-65.26||
BA|Bosnia and Herzegovina|Bosnia ed Erzegovina|E||Sarajevo/Sarajevo:43.86:18.41|Bosnian|bosniaco|Mostar/Mostar:43.34:17.81|Bosnia,Herzegovina,Erzegovina,Bosnia-Herzegovina,Bosnia Erzegovina|
BW|Botswana|Botswana|F||Gaborone/Gaborone:-24.65:25.91|Botswanan,Motswana|botswano|||
BR|Brazil|Brasile|A||Brasilia/Brasilia:-15.79:-47.88|Brazilian|brasiliano|Sao Paulo/San Paolo:-23.55:-46.63;Rio de Janeiro/Rio de Janeiro:-22.91:-43.17|Brasil|Lula,Bolsonaro,Bovespa,Petrobras~0.3
BN|Brunei|Brunei|S||Bandar Seri Begawan:4.89:114.94|Bruneian|bruneiano|||
BG|Bulgaria|Bulgaria|E||Sofia/Sofia~0.4:42.7:23.32|Bulgarian|bulgaro|Varna/Varna:43.2:27.91||
BF|Burkina Faso|Burkina Faso|F||Ouagadougou/Ouagadougou:12.37:-1.52|Burkinabe|burkinabe|||
BI|Burundi|Burundi|F||Gitega/Gitega:-3.43:29.93|Burundian|burundese|Bujumbura/Bujumbura:-3.38:29.36||
CV|Cabo Verde|Capo Verde|F||Praia/Praia~0.4:14.93:-23.51|Cape Verdean|capoverdiano||Cape Verde,Cabo Verde,Capo Verde|
KH|Cambodia|Cambogia|S||Phnom Penh/Phnom Penh:11.56:104.92|Cambodian|cambogiano|Siem Reap/Siem Reap:13.36:103.86||Hun Sen,Hun Manet
CM|Cameroon|Camerun|F||Yaounde/Yaounde:3.85:11.5|Cameroonian|camerunese|Douala/Douala:4.05:9.77||
CA|Canada|Canada|A||Ottawa/Ottawa:45.42:-75.7|Canadian|canadese|Toronto/Toronto:43.65:-79.38;Vancouver/Vancouver:49.28:-123.12;Montreal/Montreal:45.5:-73.57||Carney,Trudeau,Poilievre
CF|Central African Republic|Repubblica Centrafricana|F||Bangui/Bangui:4.36:18.56|Central African|centrafricano|||
TD|Chad|Ciad|F||N'Djamena/N'Djamena/Ndjamena:12.13:15.05|Chadian|ciadiano||=Chad,Ciad|
CL|Chile|Cile|A||Santiago/Santiago:-33.45:-70.67|Chilean|cileno|Valparaiso/Valparaiso:-33.05:-71.62|=Chile,Cile|Boric,Kast
CN|China|Cina|S||Beijing/Pechino/Peking:39.9:116.4|Chinese|cinese|Shanghai/Shanghai:31.23:121.47;Shenzhen/Shenzhen:22.54:114.06;Wuhan/Wuhan:30.59:114.31;Xinjiang/Xinjiang:41.1:85.0;Tibet/Tibet:31.0:88.0|PRC,Repubblica Popolare Cinese,Mainland China|Xi Jinping,Zhongnanhai,Huawei~0.3,Alibaba~0.3,Tencent~0.3,=BYD~0.3,Shanghai Composite
CO|Colombia|Colombia|A||Bogota/Bogota:4.71:-74.07|Colombian|colombiano|Medellin/Medellin:6.25:-75.57||Gustavo Petro
KM|Comoros|Comore|F||Moroni/Moroni~0.3:-11.7:43.26|Comorian|comoriano|||
CD|Democratic Republic of the Congo|Repubblica Democratica del Congo|F||Kinshasa/Kinshasa:-4.44:15.27||!|Goma/Goma:-1.68:29.22;Lubumbashi/Lubumbashi:-11.66:27.48;Bukavu/Bukavu:-2.5:28.86|DR Congo,DRC,RD Congo,RDC,Congo-Kinshasa,Congo Kinshasa,Democratic Republic of Congo,Repubblica Democratica del Congo|Tshisekedi,M23
CG|Republic of the Congo|Repubblica del Congo|F||Brazzaville/Brazzaville:-4.27:15.28||!|Pointe-Noire/Pointe-Noire:-4.78:11.86|Congo-Brazzaville,Congo Brazzaville,Republic of Congo,Repubblica del Congo|Sassou Nguesso
CR|Costa Rica|Costa Rica|A||San Jose/San Jose~0.3:9.93:-84.08|Costa Rican|costaricano|||
CI|Ivory Coast|Costa d'Avorio|F||Yamoussoukro/Yamoussoukro:6.82:-5.28|Ivorian|ivoriano|Abidjan/Abidjan:5.36:-4.01|Cote d'Ivoire,Cote dIvoire|Ouattara
HR|Croatia|Croazia|E||Zagreb/Zagabria:45.81:15.98|Croatian|croato|Dubrovnik/Ragusa:42.65:18.09||
CU|Cuba|Cuba|A||Havana/L'Avana:23.13:-82.38|Cuban|cubano|Guantanamo/Guantanamo:20.14:-75.21||Diaz-Canel
CY|Cyprus|Cipro|E||Nicosia/Nicosia:35.17:33.36|Cypriot|cipriota|Limassol/Limassol:34.68:33.04||
CZ|Czechia|Repubblica Ceca|E||Prague/Praga:50.08:14.44|Czech|!ceco,ceca,cechi,cheche|Brno/Brno:49.2:16.61|Czech Republic,Cechia,Repubblica Ceca|Babis
DK|Denmark|Danimarca|E||Copenhagen/Copenaghen:55.68:12.57|Danish,Dane|danese|Aarhus/Aarhus:56.16:10.2||Frederiksen
DJ|Djibouti|Gibuti|F||Djibouti/Gibuti:11.59:43.15|Djiboutian|gibutiano|||
DM|Dominica|Dominica|A||Roseau/Roseau:15.3:-61.39|||||
DO|Dominican Republic|Repubblica Dominicana|A||Santo Domingo/Santo Domingo:18.49:-69.93|Dominican|dominicano|Punta Cana/Punta Cana:18.58:-68.4|Dominican Republic,Repubblica Dominicana|
EC|Ecuador|Ecuador|A||Quito/Quito:-0.18:-78.47|Ecuadorian|ecuadoriano|Guayaquil/Guayaquil:-2.17:-79.92||Noboa
EG|Egypt|Egitto|M||Cairo/Il Cairo:30.04:31.24|Egyptian|egiziano|Alexandria/Alessandria d'Egitto~0.4:31.2:29.92;Suez/Suez:29.97:32.55;Sinai/Sinai:29.5:33.8;Rafah Crossing~0.1:31.3:34.2||Sisi,al-Sisi
SV|El Salvador|El Salvador|A||San Salvador/San Salvador:13.69:-89.19|Salvadoran|salvadoregno|||Bukele
GQ|Equatorial Guinea|Guinea Equatoriale|F||Malabo/Malabo:3.75:8.78|Equatoguinean,Equatorial Guinean|equatoguineano|||
ER|Eritrea|Eritrea|F||Asmara/Asmara:15.32:38.93|Eritrean|eritreo|||
EE|Estonia|Estonia|E||Tallinn/Tallinn:59.44:24.75|Estonian|estone|Narva/Narva:59.38:28.2||
SZ|Eswatini|Eswatini|F||Mbabane/Mbabane:-26.32:31.14|Swazi|swazi||Eswatini,Swaziland|
ET|Ethiopia|Etiopia|F||Addis Ababa/Addis Abeba:9.03:38.74|Ethiopian|etiope|Tigray/Tigray:14.1:38.3||Abiy Ahmed,Abiy
FJ|Fiji|Figi|O||Suva/Suva:-18.14:178.44|Fijian|figiano|||
FI|Finland|Finlandia|E||Helsinki/Helsinki:60.17:24.94|Finnish,Finn|finlandese|Tampere/Tampere:61.5:23.76||Stubb,Orpo
FR|France|Francia|E||Paris/Parigi:48.86:2.35|French|francese|Marseille/Marsiglia:43.3:5.37;Lyon/Lione:45.76:4.84;Nizza/Nizza:43.7:7.26|Francia|Macron,Le Pen,Elysee,Eliseo,Matignon,Quai d'Orsay,CAC 40,Bayrou,Lecornu
GA|Gabon|Gabon|F||Libreville/Libreville:0.39:9.45|Gabonese|gabonese|||
GM|Gambia|Gambia|F||Banjul/Banjul:13.45:-16.58|Gambian|gambiano||The Gambia|
GE|Georgia|Georgia|S||Tbilisi/Tbilisi:41.72:44.79|Georgian|georgiano|Batumi/Batumi:41.64:41.64;Abkhazia/Abkhazia:43.0:41.0;South Ossetia/Ossezia del Sud:42.22:43.97||Georgian Dream,Sogno georgiano
DE|Germany|Germania|E||Berlin/Berlino:52.52:13.4|German|!tedesco,tedesca,tedeschi,tedesche,germanico|Munich/Monaco di Baviera/Bayern Monaco:48.14:11.58;Frankfurt/Francoforte:50.11:8.68;Hamburg/Amburgo:53.55:9.99|Deutschland|Merz,Scholz,Bundestag,Bundesbank,=DAX,Bundeswehr,Habeck,Baerbock
GH|Ghana|Ghana|F||Accra/Accra:5.6:-0.19|Ghanaian|ghanese|Kumasi/Kumasi:6.69:-1.62||
GR|Greece|Grecia|E||Athens/Atene:37.98:23.73|Greek|!greco,greca,greci,greche|Thessaloniki/Salonicco:40.64:22.94;Crete/Creta:35.24:24.81|Grecia,Hellenic Republic|Mitsotakis
GD|Grenada|Grenada|A||Saint George's/Saint George's/St George's:12.05:-61.75|Grenadian|grenadino|||
GT|Guatemala|Guatemala|A||Guatemala City/Citta del Guatemala:14.63:-90.51|Guatemalan|guatemalteco|||Arevalo
GN|Guinea|Guinea|F||Conakry/Conakry:9.64:-13.58|Guinean|guineano||Guinea-Conakry|Doumbouya
GW|Guinea-Bissau|Guinea-Bissau|F||Bissau/Bissau:11.86:-15.6|Bissau-Guinean|bissauguineano||Guinea Bissau|
GY|Guyana|Guyana|A||Georgetown/Georgetown~0.3:6.8:-58.16|Guyanese|guyanese|||
HT|Haiti|Haiti|A||Port-au-Prince/Port-au-Prince/Port au Prince:18.54:-72.34|Haitian|haitiano|||
HN|Honduras|Honduras|A||Tegucigalpa/Tegucigalpa:14.07:-87.19|Honduran|honduregno|San Pedro Sula/San Pedro Sula:15.5:-88.03||
HU|Hungary|Ungheria|E||Budapest/Budapest:47.5:19.04|Hungarian|ungherese|||Orban,Magyar~0.3
IS|Iceland|Islanda|E||Reykjavik/Reykjavik:64.15:-21.94|Icelandic,Icelander|islandese|||
IN|India|India|S||New Delhi/Nuova Delhi/Delhi:28.61:77.21|Indian|indiano|Mumbai/Mumbai/Bombay:19.08:72.88;Bangalore/Bangalore/Bengaluru:12.97:77.59;Kolkata/Calcutta:22.57:88.36;Kashmir/Kashmir/Cashmere:34.08:74.8||Modi,Sensex,Nifty,Lok Sabha,Reliance Industries~0.3
ID|Indonesia|Indonesia|S||Jakarta/Giacarta:-6.2:106.85|Indonesian|indonesiano|Surabaya/Surabaya:-7.25:112.75;Bali/Bali:-8.34:115.09||Prabowo
IR|Iran|Iran|M||Tehran/Teheran:35.69:51.39|Iranian,Persian|iraniano|Strait of Hormuz/Stretto di Hormuz/Hormuz/Ormuz/Stretto di Ormuz/Hormuz Strait:26.57:56.25;Isfahan/Isfahan/Esfahan:32.65:51.67;Tabriz/Tabriz:38.08:46.29;Natanz/Natanz:33.72:51.73;Bushehr/Bushehr:28.97:50.84;Kharg/Kharg:29.23:50.32;Bandar Abbas/Bandar Abbas:27.18:56.27|Islamic Republic of Iran,Repubblica Islamica|Khamenei,Pezeshkian,Araghchi,Ayatollah,IRGC,Pasdaran,Guardie della rivoluzione,Revolutionary Guard,Revolutionary Guards,Mojtaba
IQ|Iraq|Iraq|M||Baghdad/Baghdad:33.31:44.37|Iraqi|iracheno|Mosul/Mosul:36.34:43.13;Basra/Bassora:30.51:47.78;Erbil/Erbil:36.19:44.01;Kurdistan/Kurdistan:36.4:44.0||Sudani,Green Zone
IE|Ireland|Irlanda|E||Dublin/Dublino:53.35:-6.26|Irish|irlandese|=Cork~0.4:51.9:-8.47||Taoiseach
IL|Israel|Israele|M||Jerusalem/Gerusalemme:31.77:35.21|Israeli|israeliano|Tel Aviv/Tel Aviv:32.09:34.78;Haifa/Haifa:32.79:34.99;Beersheba/Beer Sheva:31.25:34.79;Golan/Golan:32.98:35.75||Netanyahu,Knesset,=IDF,Tsahal,Mossad,Shin Bet,Cupola di ferro,Iron Dome,Smotrich,Ben Gvir,Ben-Gvir
IT|Italy|Italia|E||Rome/Roma:41.9:12.5|Italian|italiano|Milan/Milano:45.46:9.19;Naples/Napoli:40.85:14.27;Turin/Torino:45.07:7.69;Sicily/Sicilia:37.6:14.0;Lampedusa/Lampedusa:35.5:12.6;Venice/Venezia:45.44:12.32;Florence/Firenze:43.77:11.25;Palermo/Palermo:38.12:13.36||Meloni,Palazzo Chigi,Mattarella,Salvini,Tajani,Schlein,Quirinale,Montecitorio,Viminale,Piazza Affari,Ftse Mib,Borsa di Milano,Borsa Italiana,Farnesina,Crosetto,Giorgetti,Palazzo Madama
JM|Jamaica|Giamaica|A||Kingston/Kingston:17.97:-76.79|Jamaican|giamaicano|||
JP|Japan|Giappone|S||Tokyo/Tokyo:35.68:139.69|Japanese|giapponese|Osaka/Osaka:34.69:135.5;Fukushima/Fukushima:37.76:140.47;Okinawa/Okinawa:26.5:127.9|Giappone|Takaichi,Ishiba,Nikkei,Bank of Japan,Banca del Giappone,Toyota~0.3,Sony~0.3,=BoJ,Kishida
JO|Jordan|Giordania|M||Amman/Amman:31.95:35.93|Jordanian|giordano|Aqaba/Aqaba:29.53:35.0|=Jordan,Giordania|King Abdullah II,Re Abdallah
KZ|Kazakhstan|Kazakistan|S||Astana/Astana:51.17:71.43|Kazakh|kazako|Almaty/Almaty:43.24:76.89||Tokayev
KE|Kenya|Kenya|F||Nairobi/Nairobi:-1.29:36.82|Kenyan|keniano,keniota|Mombasa/Mombasa:-4.04:39.67||Ruto
KI|Kiribati|Kiribati|O||Tarawa/Tarawa:1.45:173.03|I-Kiribati|kiribatiano|||
KW|Kuwait|Kuwait|M||Kuwait City/Citta del Kuwait:29.38:47.99|Kuwaiti|kuwaitiano|||
KG|Kyrgyzstan|Kirghizistan|S||Bishkek/Bishkek:42.87:74.59|Kyrgyz|kirghiso|||Japarov
LA|Laos|Laos|S||Vientiane/Vientiane:17.97:102.6|Lao,Laotian|laotiano|||
LV|Latvia|Lettonia|E||Riga/Riga:56.95:24.11|Latvian|lettone|||
LB|Lebanon|Libano|M||Beirut/Beirut:33.89:35.5|Lebanese|libanese|Sidon/Sidone:33.56:35.37;Baalbek/Baalbek:34.0:36.2|Lebanon|Hezbollah,Hizbullah,Hizballah,Nasrallah,Aoun~0.2
LS|Lesotho|Lesotho|F||Maseru/Maseru:-29.31:27.48|Basotho|lesothiano|||
LR|Liberia|Liberia|F||Monrovia/Monrovia:6.3:-10.8|Liberian|liberiano|||
LY|Libya|Libia|F||Tripoli/Tripoli~0.5:32.89:13.19|Libyan|!libico,libica,libici,libiche|Benghazi/Bengasi:32.12:20.07;Misrata/Misurata:32.38:15.09||Haftar,Dbeibah,Dbeibeh
LI|Liechtenstein|Liechtenstein|E||Vaduz/Vaduz:47.14:9.52|Liechtensteiner|liechtensteiniano|||
LT|Lithuania|Lituania|E||Vilnius/Vilnius:54.69:25.28|Lithuanian|lituano|Kaunas/Kaunas:54.9:23.9||
LU|Luxembourg|Lussemburgo|E||Luxembourg City/Citta del Lussemburgo:49.61:6.13|Luxembourgish|lussemburghese|||
MG|Madagascar|Madagascar|F||Antananarivo/Antananarivo:-18.88:47.51|Malagasy|!malgascio,malgascia,malgasci,malgasce|||
MW|Malawi|Malawi|F||Lilongwe/Lilongwe:-13.96:33.77|Malawian|malawiano|Blantyre/Blantyre:-15.79:35.0||
MY|Malaysia|Malesia|S||Kuala Lumpur/Kuala Lumpur:3.14:101.69|Malaysian|malese|Penang/Penang:5.41:100.33||Anwar Ibrahim
MV|Maldives|Maldive|S||Male City~0.3:4.18:73.51|Maldivian|maldiviano||Maldives,Maldive|
ML|Mali|Mali|F||Bamako/Bamako:12.64:-8.0|Malian|maliano|Timbuktu/Timbuctu:16.77:-3.0|=Mali|
MT|Malta|Malta|E||Valletta/La Valletta:35.9:14.51|Maltese|maltese|||
MH|Marshall Islands|Isole Marshall|O||Majuro/Majuro:7.09:171.38|Marshallese|marshallese||Marshall Islands,Isole Marshall|
MR|Mauritania|Mauritania|F||Nouakchott/Nouakchott:18.09:-15.98|Mauritanian|mauritano|||
MU|Mauritius|Mauritius|F||Port Louis/Port Louis:-20.16:57.5|Mauritian|mauriziano|||
MX|Mexico|Messico|A||Mexico City/Citta del Messico:19.43:-99.13|Mexican|messicano|Guadalajara/Guadalajara:20.66:-103.35;Monterrey/Monterrey:25.67:-100.31;Tijuana/Tijuana:32.51:-117.04||Sheinbaum,Lopez Obrador,Sinaloa~0.3
FM|Micronesia|Micronesia|O||Palikir/Palikir:6.92:158.16|Micronesian|micronesiano|||
MD|Moldova|Moldavia|E||Chisinau/Chisinau:47.01:28.86|Moldovan|moldavo|Transnistria/Transnistria:46.84:29.63|Moldavia|Maia Sandu
MC|Monaco|Principato di Monaco|E||Monaco/Monaco:43.74:7.42|Monegasque|monegasco||Principato di Monaco|
MN|Mongolia|Mongolia|S||Ulaanbaatar/Ulan Bator:47.89:106.91|Mongolian|mongolo|||
ME|Montenegro|Montenegro|E||Podgorica/Podgorica:42.44:19.26|Montenegrin|montenegrino|||
MA|Morocco|Marocco|F||Rabat/Rabat:34.02:-6.84|Moroccan|marocchino|Casablanca/Casablanca:33.57:-7.59;Marrakesh/Marrakech:31.63:-8.0||
MZ|Mozambique|Mozambico|F||Maputo/Maputo:-25.97:32.57|Mozambican|mozambicano|Cabo Delgado/Cabo Delgado:-12.3:40.0||
MM|Myanmar|Birmania|S||Naypyidaw/Naypyidaw:19.76:96.08|Burmese,Myanmar|birmano|Yangon/Rangoon:16.87:96.2;Mandalay/Mandalay:21.97:96.08|Burma,Birmania|Min Aung Hlaing,Tatmadaw
NA|Namibia|Namibia|F||Windhoek/Windhoek:-22.56:17.08|Namibian|namibiano|||
NR|Nauru|Nauru|O||Yaren/Yaren:-0.55:166.92|Nauruan|nauruano|||
NP|Nepal|Nepal|S||Kathmandu/Katmandu:27.72:85.32|Nepali,Nepalese|nepalese|||
NL|Netherlands|Paesi Bassi|E||Amsterdam/Amsterdam:52.37:4.9|Dutch|olandese,neerlandese|The Hague/L'Aia:52.08:4.31;Rotterdam/Rotterdam:51.92:4.48|Holland,Olanda,Pays-Bas|Wilders
NZ|New Zealand|Nuova Zelanda|O||Wellington/Wellington:-41.29:174.78|New Zealander|neozelandese|Auckland/Auckland:-36.85:174.76||Luxon
NI|Nicaragua|Nicaragua|A||Managua/Managua:12.13:-86.25|Nicaraguan|nicaraguense|||Daniel Ortega
NE|Niger|Niger|F||Niamey/Niamey:13.51:2.11|Nigerien|nigerino||=Niger|
NG|Nigeria|Nigeria|F||Abuja/Abuja:9.06:7.49|Nigerian|nigeriano|Lagos/Lagos:6.52:3.38||Tinubu,Boko Haram
KP|North Korea|Corea del Nord|S||Pyongyang/Pyongyang:39.04:125.76|North Korean|nordcoreano|||DPRK,Corea Nord,Nord Corea,Kim Jong Un,Kim Jong-un,Kim Yo Jong
MK|North Macedonia|Macedonia del Nord|E||Skopje/Skopje:41.99:21.43|Macedonian|macedone||Macedonia|
NO|Norway|Norvegia|E||Oslo/Oslo:59.91:10.75|Norwegian|norvegese|Bergen/Bergen:60.39:5.32||Equinor~0.3
OM|Oman|Oman|M||Muscat/Mascate:23.59:58.41|Omani|omanita||=Oman|
PK|Pakistan|Pakistan|S||Islamabad/Islamabad:33.68:73.05|Pakistani|pakistano|Karachi/Karachi:24.86:67.0;Lahore/Lahore:31.55:74.34;Peshawar/Peshawar:34.0:71.58||Shehbaz Sharif,Imran Khan
PW|Palau|Palau|O||Ngerulmud/Ngerulmud:7.5:134.62|Palauan|palauano|||
PS|Palestine|Palestina|M||Ramallah/Ramallah:31.9:35.2|Palestinian|palestinese|Gaza/Gaza/Gaza City/Gaza Strip/Striscia di Gaza:31.5:34.47;West Bank/Cisgiordania:31.95:35.3;Rafah/Rafah:31.29:34.25;Khan Younis/Khan Yunis:31.34:34.3;Jenin/Jenin:32.46:35.3|Palestine,Palestina,State of Palestine|Hamas,Mahmoud Abbas,Abu Mazen,Jihad islamica,Islamic Jihad
PA|Panama|Panama|A||Panama City/Citta di Panama:8.98:-79.52|Panamanian|panamense|Panama Canal/Canale di Panama:9.08:-79.68||Mulino
PG|Papua New Guinea|Papua Nuova Guinea|O||Port Moresby/Port Moresby:-9.44:147.18|Papua New Guinean|papuano|||
PY|Paraguay|Paraguay|A||Asuncion/Asuncion:-25.26:-57.58|Paraguayan|paraguaiano|||
PE|Peru|Peru|A||Lima/Lima:-12.05:-77.04|Peruvian|peruviano|Cusco/Cusco:-13.53:-71.97||Boluarte
PH|Philippines|Filippine|S||Manila/Manila:14.6:120.98|Filipino,Philippine|filippino|Cebu/Cebu:10.32:123.89;Mindanao/Mindanao:7.5:125.0|Philippines,Filippine|Marcos Jr,Ferdinand Marcos
PL|Poland|Polonia|E||Warsaw/Varsavia:52.23:21.01|=Polish,Poles|!polacco,polacca,polacchi,polacche|Krakow/Cracovia:50.06:19.94;Gdansk/Danzica:54.35:18.65||Tusk,Nawrocki,Sejm
PT|Portugal|Portogallo|E||Lisbon/Lisbona:38.72:-9.14|Portuguese|portoghese|||
QA|Qatar|Qatar|M||Doha/Doha:25.29:51.53|Qatari|qatariota,qatarino|||
RO|Romania|Romania|E||Bucharest/Bucarest:44.43:26.1|Romanian|rumeno,romeno|Constanta/Constanta:44.18:28.65||
RU|Russia|Russia|E||Moscow/Mosca:55.76:37.62|Russian|russo|Saint Petersburg/San Pietroburgo:59.93:30.34;Kursk/Kursk:51.73:36.19;Belgorod/Belgorod:50.6:36.6;Kaliningrad/Kaliningrad:54.71:20.51|Russian Federation,Federazione Russa|Putin,Kremlin,Cremlino,Lavrov,Medvedev,Peskov,Zakharova,Gazprom~0.3,Rosneft~0.3,Shoigu,Gerasimov,Belousov
RW|Rwanda|Ruanda|F||Kigali/Kigali:-1.95:30.06|Rwandan|ruandese|||Kagame
KN|Saint Kitts and Nevis|Saint Kitts e Nevis|A||Basseterre/Basseterre:17.3:-62.72|Kittitian|sankittiano||St Kitts,Saint Kitts|
LC|Saint Lucia|Santa Lucia|A||Castries/Castries:14.01:-60.99|Saint Lucian|santaluciano||St Lucia,Saint Lucia|
VC|Saint Vincent and the Grenadines|Saint Vincent e Grenadine|A||Kingstown/Kingstown:13.16:-61.22|Vincentian|vincentino||St Vincent,Saint Vincent|
WS|Samoa|Samoa|O||Apia/Apia:-13.83:-171.76|Samoan|samoano|||
SM|San Marino|San Marino|E||San Marino/San Marino:43.94:12.45|Sammarinese|sammarinese|||
ST|Sao Tome and Principe|Sao Tome e Principe|F||Sao Tome/Sao Tome:0.34:6.73|Sao Tomean|santomense||Sao Tome and Principe|
SA|Saudi Arabia|Arabia Saudita|M||Riyadh/Riad:24.71:46.68|Saudi|saudita|Jeddah/Gedda:21.54:39.17;Mecca/La Mecca:21.42:39.83||bin Salman,=MBS,Aramco~0.4
SN|Senegal|Senegal|F||Dakar/Dakar:14.72:-17.47|Senegalese|senegalese|||
RS|Serbia|Serbia|E||Belgrade/Belgrado:44.79:20.45|Serbian|serbo|Novi Sad/Novi Sad:45.25:19.84||Vucic
SC|Seychelles|Seychelles|F||Victoria~0.1:-4.62:55.45|Seychellois|seychellese|||
SL|Sierra Leone|Sierra Leone|F||Freetown/Freetown:8.48:-13.23|Sierra Leonean|sierraleonese|||
SG|Singapore|Singapore|S||Singapore/Singapore:1.35:103.82|Singaporean|singaporiano|||
SK|Slovakia|Slovacchia|E||Bratislava/Bratislava:48.15:17.11|Slovak|!slovacco,slovacca,slovacchi,slovacche|||
SI|Slovenia|Slovenia|E||Ljubljana/Lubiana:46.06:14.51|Slovenian,Slovene|sloveno|||
SB|Solomon Islands|Isole Salomone|O||Honiara/Honiara:-9.43:159.95|Solomon Islander|salomonese||Solomon Islands,Isole Salomone|
SO|Somalia|Somalia|F||Mogadishu/Mogadiscio:2.05:45.32|Somali|somalo|||Al-Shabaab,Al Shabaab,Shabaab
ZA|South Africa|Sudafrica|F||Pretoria/Pretoria:-25.75:28.19|South African|sudafricano|Johannesburg/Johannesburg:-26.2:28.05;Cape Town/Citta del Capo:-33.92:18.42|Sud Africa|Ramaphosa
KR|South Korea|Corea del Sud|S||Seoul/Seul:37.57:126.98|South Korean|sudcoreano|Busan/Busan:35.18:129.08|Sud Corea,Corea Sud|Lee Jae-myung,Yoon Suk Yeol,Kospi,Samsung~0.3,Hyundai~0.3
SS|South Sudan|Sud Sudan|F||Juba/Juba:4.85:31.58|South Sudanese|sudsudanese||Sudan del Sud,Sud Sudan|Salva Kiir
ES|Spain|Spagna|E||Madrid/Madrid:40.42:-3.7|Spanish,Spaniard|spagnolo|Barcelona/Barcellona:41.39:2.17;Valencia/Valencia:39.47:-0.38;Seville/Siviglia:37.39:-5.98|Espana|Moncloa,Ibex 35,Pedro Sanchez
LK|Sri Lanka|Sri Lanka|S||Colombo/Colombo:6.93:79.86|Sri Lankan|singalese,srilankese|||
SD|Sudan|Sudan|F||Khartoum/Khartum:15.5:32.56|Sudanese|sudanese|Port Sudan/Port Sudan:19.62:37.22;Darfur/Darfur:13.5:25.0;El Fasher/El Fasher:13.63:25.35||Burhan,Rapid Support Forces,Forze di supporto rapido,Hemedti
SR|Suriname|Suriname|A||Paramaribo/Paramaribo:5.85:-55.2|Surinamese|surinamese|||
SE|Sweden|Svezia|E||Stockholm/Stoccolma:59.33:18.07|Swedish,Swede|svedese|Gothenburg/Goteborg:57.71:11.97||Kristersson
CH|Switzerland|Svizzera|E||Bern/Berna:46.95:7.45|Swiss|svizzero|Zurich/Zurigo:47.38:8.54;Geneva/Ginevra:46.2:6.14|Svizzera|
SY|Syria|Siria|M||Damascus/Damasco:33.51:36.29|Syrian|siriano|Aleppo/Aleppo:36.2:37.13;Idlib/Idlib:35.93:36.63;Latakia/Latakia:35.52:35.78||Assad,al-Sharaa,Sharaa,Jolani,Hayat Tahrir al-Sham
TW|Taiwan|Taiwan|S||Taipei/Taipei:25.03:121.57|Taiwanese|taiwanese|Kaohsiung/Kaohsiung:22.63:120.3;Taiwan Strait/Stretto di Taiwan:24.5:119.5||Lai Ching-te,TSMC~0.4,Foxconn~0.3
TJ|Tajikistan|Tagikistan|S||Dushanbe/Dushanbe:38.56:68.78|Tajik|tagiko|||
TZ|Tanzania|Tanzania|F||Dodoma/Dodoma:-6.17:35.74|Tanzanian|tanzaniano|Dar es Salaam/Dar es Salaam:-6.79:39.21;Zanzibar/Zanzibar:-6.16:39.2||
TH|Thailand|Thailandia|S||Bangkok/Bangkok:13.76:100.5|Thai|thailandese|Phuket/Phuket:7.88:98.39;Chiang Mai/Chiang Mai:18.79:98.98|Thailand|Anutin,Paetongtarn
TL|Timor-Leste|Timor Est|S||Dili/Dili:-8.56:125.57|Timorese|timorese||East Timor,Timor Est,Timor Leste,Timor-Leste|
TG|Togo|Togo|F||Lome/Lome:6.13:1.22|Togolese|togolese||=Togo|
TO|Tonga|Tonga|O||Nuku'alofa/Nuku'alofa:-21.14:-175.2|Tongan|tongano||=Tonga|
TT|Trinidad and Tobago|Trinidad e Tobago|A||Port of Spain/Port of Spain:10.65:-61.51|Trinidadian|trinidadiano||Trinidad,Trinidad and Tobago,Trinidad e Tobago|
TN|Tunisia|Tunisia|F||Tunis/Tunisi:36.81:10.17|Tunisian|tunisino|Sfax/Sfax:34.74:10.76||Saied
TR|Turkey|Turchia|M||Ankara/Ankara:39.93:32.86|Turkish,Turk|!turco,turca,turchi,turche|Istanbul/Istanbul:41.01:28.98;Izmir/Smirne:38.42:27.14|=Turkey,Turkiye,Turchia|Erdogan,Fidan
TM|Turkmenistan|Turkmenistan|S||Ashgabat/Ashgabat:37.96:58.33|Turkmen|turkmeno|||
TV|Tuvalu|Tuvalu|O||Funafuti/Funafuti:-8.52:179.2|Tuvaluan|tuvaluano|||
UG|Uganda|Uganda|F||Kampala/Kampala:0.35:32.58|Ugandan|ugandese|||Museveni
UA|Ukraine|Ucraina|E||Kyiv/Kiev/Kyev:50.45:30.52|Ukrainian|ucraino|Kharkiv/Kharkiv/Kharkov/Kharkiv/Charkiv:49.99:36.23;Odesa/Odessa/Odesa:46.48:30.73;Lviv/Leopoli/Lvov:49.84:24.03;Donbass/Donbass/Donbas:48.3:38.0;Crimea/Crimea/Krym:45.0:34.0;Kherson/Kherson:46.64:32.62;Zaporizhzhia/Zaporizhzhia/Zaporizhia/Zaporozhye/Zaporizhzhya:47.84:35.14;Mariupol/Mariupol:47.1:37.55;Donetsk/Donetsk:48.0:37.8;Luhansk/Lugansk:48.57:39.3;Dnipro/Dnipro:48.46:35.05|Ukraina|Zelensky,Zelenskyy,Zelenskiy,Zelenski,Syrskyi,Verkhovna Rada,Kuleba
AE|United Arab Emirates|Emirati Arabi Uniti|M||Abu Dhabi/Abu Dhabi:24.45:54.38|Emirati|emiratino|Dubai/Dubai:25.2:55.27|=UAE,United Arab Emirates,Emirati Arabi,Emirati Uniti|
GB|United Kingdom|Regno Unito|E||London/Londra:51.51:-0.13|British,Briton,Briton|britannico|Manchester/Manchester:53.48:-2.24;Edinburgh/Edimburgo:55.95:-3.19;Belfast/Belfast:54.6:-5.93;Glasgow/Glasgow:55.86:-4.25|=UK,=Uk,Britain,Great Britain,Gran Bretagna,England,Scotland,Wales,Inghilterra,Scozia,Galles,Northern Ireland,Irlanda del Nord,Regno Unito,Perfida Albione~0.2|Starmer,Downing Street,Westminster,Sunak,Bank of England,Banca d'Inghilterra,FTSE,Buckingham,Whitehall,King Charles,Re Carlo,Reform UK,Farage
US|United States|Stati Uniti|A||Washington/Washington:38.9:-77.04|American|americano|New York/New York:40.71:-74.0;Los Angeles/Los Angeles:34.05:-118.24;Chicago/Chicago:41.88:-87.63;San Francisco/San Francisco:37.77:-122.42;Miami/Miami:25.76:-80.19;Texas/Texas:31.0:-100.0;California/California:37.0:-120.0;Florida/Florida:28.0:-82.0;Alaska/Alaska:64.2:-149.5;New Mexico/Nuovo Messico:34.4:-106.1;Atlanta/Atlanta:33.75:-84.39;Silicon Valley/Silicon Valley:37.4:-122.1;Guantanamo Bay~0.2:19.9:-75.1|=US,=USA,=Usa,United States of America,Stati Uniti d'America,=America~0.5,Uncle Sam,Etats-Unis,Unites States|Trump,White House,Casa Bianca,Pentagon,Pentagono,Vance,Rubio,Hegseth,Capitol Hill,=Fed,Federal Reserve,Jerome Powell,Wall Street,Nasdaq,Dow Jones,S&P 500,Biden,Dipartimento di Stato,State Department,=Apple~0.3,Microsoft~0.3,Nvidia~0.3,Tesla~0.3,OpenAI~0.3,Boeing~0.3,Oval Office,Studio Ovale,Mar-a-Lago,Netflix~0.2,Pelosi,Musk~0.3,Bessent,Lutnick,Witkoff,Kushner
UY|Uruguay|Uruguay|A||Montevideo/Montevideo:-34.9:-56.19|Uruguayan|uruguaiano|||
UZ|Uzbekistan|Uzbekistan|S||Tashkent/Tashkent:41.3:69.24|Uzbek|uzbeko|Samarkand/Samarcanda:39.65:66.96||Mirziyoyev
VU|Vanuatu|Vanuatu|O||Port Vila/Port Vila:-17.73:168.32|Ni-Vanuatu|vanuatuano|||
VA|Vatican City|Citta del Vaticano|E||Vatican City/Citta del Vaticano/Vaticano:41.9:12.45||vaticano||Vatican,Vaticano,Santa Sede,Holy See|Papa Leone,Pope Leo,Papa Francesco,Pope Francis,=Pope,San Pietro,Curia
VE|Venezuela|Venezuela|A||Caracas/Caracas:10.49:-66.88|Venezuelan|venezuelano|Maracaibo/Maracaibo:10.65:-71.64||Maduro,Delcy Rodriguez,Maria Corina Machado,Chavez~0.3,Cabello
VN|Vietnam|Vietnam|S||Hanoi/Hanoi:21.03:105.85|Vietnamese|vietnamita|Ho Chi Minh City/Ho Chi Minh City/Saigon:10.82:106.63||
YE|Yemen|Yemen|M||Sanaa/Sanaa:15.35:44.2|Yemeni|yemenita|Aden/Aden:12.78:45.04;Hodeidah/Hodeida:14.8:42.95;Red Sea/Mar Rosso/Bab el-Mandeb/Bab al-Mandab:15.0:41.5||Houthi,Houthis,Huthi,Huthis,Ansar Allah,Ansarullah
ZM|Zambia|Zambia|F||Lusaka/Lusaka:-15.39:28.32|Zambian|zambiano|||Hichilema
ZW|Zimbabwe|Zimbabwe|F||Harare/Harare:-17.83:31.05|Zimbabwean|zimbabwano|Bulawayo/Bulawayo:-20.15:28.58||Mnangagwa
XK|Kosovo|Kosovo|E||Pristina/Pristina:42.66:21.17|Kosovar|kosovaro|||Kurti
HK|Hong Kong|Hong Kong|S|22.32,114.17|Hong Kong/Hong Kong:22.32:114.17|Hongkonger|hongkonghese||Hang Seng|
GL|Greenland|Groenlandia|A||Nuuk/Nuuk:64.18:-51.72|Greenlandic|groenlandese||Greenland,Groenlandia|
EH|Western Sahara|Sahara Occidentale|F||Laayoune/El Aaiun:27.15:-13.2|Sahrawi|saharawi||Western Sahara,Sahara Occidentale,Polisario|
EU|European Union|Unione Europea|E|50.85,4.35|Brussels/Bruxelles~0.5:50.85:4.35||||European Union,Unione Europea,=EU,=UE,=Ue,Eurozone,Eurozona,Euro area,Area euro|von der Leyen,Kallas,Lagarde,=ECB,BCE,Banca centrale europea,European Central Bank,Eurogruppo,Commissione europea,European Commission,Parlamento europeo,European Parliament,Strasburgo,Schengen,Frontex,Eurostat,Consiglio europeo,European Council
"""

# Regole di ambiguita' (applicate in engine/geo.py).
#   term: '=' prefisso = case-sensitive. targets: iso2 -> peso.
#   reject_if_name_neighbor: scarta se adiacente a parola capitalizzata (nome di persona).
#   forbid_any: scarta se uno di questi token e' presente nel testo.
#   context: [{"any": [token..], "targets": {...}}] primo match vince; altrimenti 'targets'.
AMBIGUOUS = [
    {"term": "Georgia", "targets": {"GE": 0.9},
     "context": [{"any": ["atlanta", "usa", "us", "trump", "biden", "senate", "senato", "savannah", "peach", "republican", "democrat",
                          "democratico", "repubblicano", "gop", "america", "americano", "american", "stati", "uniti", "state", "stato",
                          "governor", "governatore", "fulton", "kemp", "ossoff", "warnock", "texas", "florida", "alabama", "carolina"],
                  "targets": {"US": 0.9}},
                 {"any": ["tbilisi", "caucaso", "caucasus", "sogno", "dream", "abkhazia", "ossetia", "ossezia", "saakashvili",
                          "kobakhidze", "kavelashvili", "zourabichvili", "russia", "mosca", "ue", "eu", "brussels", "bruxelles", "batumi"],
                  "targets": {"GE": 1.0}}]},
    {"term": "=Jordan", "targets": {"JO": 1.0}, "reject_if_name_neighbor": True},
    {"term": "=Chad", "targets": {"TD": 1.0}, "reject_if_name_neighbor": True},
    {"term": "=Turkey", "targets": {"TR": 1.0},
     "forbid_any": ["thanksgiving", "christmas", "natale", "roast", "arrosto", "butterball", "gobbler", "tacchino", "turkeys", "avian", "aviaria", "poultry"]},
    {"term": "Congo", "targets": {"CD": 0.7, "CG": 0.3}},
    {"term": "Congolese", "targets": {"CD": 0.55, "CG": 0.25}},
    {"term": "Congolesi", "targets": {"CD": 0.55, "CG": 0.25}},
    {"term": "Korea", "targets": {"KR": 0.7}},
    {"term": "Corea", "targets": {"KR": 0.7}},
    {"term": "Korean", "targets": {"KR": 0.6}},
    {"term": "Coreano", "targets": {"KR": 0.6}},
    {"term": "Coreana", "targets": {"KR": 0.6}},
    {"term": "Coreani", "targets": {"KR": 0.6}},
    {"term": "Coreane", "targets": {"KR": 0.6}},
    {"term": "Korean peninsula", "targets": {"KR": 0.5, "KP": 0.5}},
    {"term": "Penisola coreana", "targets": {"KR": 0.5, "KP": 0.5}},
    {"term": "=Monaco", "targets": {"DE": 0.5, "MC": 0.4},
     "context": [{"any": ["principato", "grimaldi", "ligue", "montecarlo", "carlo", "prince", "albert", "casino", "principality"], "targets": {"MC": 0.9}}]},
    {"term": "Dominicano", "targets": {"DO": 0.8}},
    {"term": "Brussels", "targets": {"BE": 0.5, "EU": 0.5}},
    {"term": "Bruxelles", "targets": {"BE": 0.5, "EU": 0.5}},
]

SOURCE_LABELS = ["name", "alias", "demonym", "capital", "city", "leader"]


def it_forms(w):
    if w.startswith("!"):
        return [x.strip() for x in w[1:].split(",") if x.strip()]
    if w.endswith("o"):
        s = w[:-1]
        return [s + "o", s + "a", s + "i", s + "e"]
    if w.endswith("e"):
        s = w[:-1]
        return [s + "e", s + "i"]
    return [w]


def parse_it_dem(field):
    """Il campo puo' contenere piu' voci separate da ',', ma '!' consuma il resto della lista."""
    out = []
    if field.startswith("!"):
        return [x.strip() for x in field[1:].split(",") if x.strip()]
    for part in field.split(","):
        part = part.strip()
        if not part:
            continue
        if "!" in part:
            lit = part.split("!")
            out.extend(it_forms(lit[0]) if lit[0] else [])
            out.extend(x for x in lit[1:] if x)
        else:
            out.extend(it_forms(part))
    return out


def en_dem(field):
    out = []
    for p in field.split(","):
        p = p.strip()
        if not p:
            continue
        out.append(p)
        if not (p.startswith("=") or p.endswith(("ese", "ss", "ch", "sh", "ish")) or p in ("Thai", "Swiss", "Dutch", "Czech", "Lao", "Slovak")):
            out.append(p + "s")
    return list(dict.fromkeys(out))


def poly_centroid(ring):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        cr = x0 * y1 - x1 * y0
        a += cr
        cx += (x0 + x1) * cr
        cy += (y0 + y1) * cr
    if abs(a) < 1e-9:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return (sum(ys) / len(ys), sum(xs) / len(xs), 0.0)
    a *= 0.5
    return (cy / (6 * a), cx / (6 * a), abs(a))


def load_centroids():
    path = os.path.join(ROOT, "data", "countries.geojson")
    out = {}
    if not os.path.exists(path):
        return out
    gj = json.load(open(path, encoding="utf-8"))
    fix = {"FRA": "FR", "NOR": "NO", "CYN": None, "SOL": None}
    for f in gj["features"]:
        p = f["properties"]
        iso = p.get("ISO_A2")
        if not iso or iso == "-99":
            iso = fix.get(p.get("ADM0_A3"))
        if not iso:
            continue
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        best = max((poly_centroid([tuple(c) for c in poly[0]]) for poly in polys), key=lambda t: t[2])
        out[iso] = (round(best[0], 2), round(best[1], 2))
    return out


def parse_names(s):
    """'Kyiv/Kiev/Kyev' -> (names, weight). Un nome puo' avere ~peso."""
    names, weight = [], None
    for n in s.split("/"):
        n = n.strip()
        if "~" in n:
            n, w = n.rsplit("~", 1)
            weight = float(w)
        if n:
            names.append(n)
    return names, weight


def parse_place(s):
    # 'Names:lat:lng'
    parts = s.rsplit(":", 2)
    names, w = parse_names(parts[0])
    return {"names": names, "lat": float(parts[1]), "lng": float(parts[2]), **({"weight": w} if w is not None else {})}


def parse_list(s):
    out = []
    for x in s.split(","):
        x = x.strip()
        if x:
            out.append(x)
    return out


def main():
    cent = load_centroids()
    entries = []
    warnings = []
    for line in DATA.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        f = line.split("|")
        while len(f) < 11:
            f.append("")
        iso, en, it, reg, cl, cap, den, dit, cities, aliases, leaders = [x.strip() for x in f[:11]]
        entry = {"iso2": iso, "name_en": en, "name_it": it, "region": REG[reg]}
        if cl:
            lat, lng = [float(x) for x in cl.split(",")]
        elif iso in cent:
            lat, lng = cent[iso]
        else:
            lat = lng = None
        capital = parse_place(cap) if cap else None
        if lat is None:
            if capital:
                lat, lng = capital["lat"], capital["lng"]
                warnings.append("no centroid, using capital: " + iso)
            else:
                raise SystemExit("no centroid " + iso)
        entry["lat"], entry["lng"] = lat, lng
        entry["aliases"] = parse_list(aliases)
        entry["demonyms"] = {"en": en_dem(den), "it": parse_it_dem(dit) if dit != "!" else []}
        if capital:
            entry["capital"] = capital
        entry["cities"] = [parse_place(c) for c in cities.split(";") if c.strip()] if cities else []
        entry["leaders"] = parse_list(leaders)
        entries.append(entry)
    isos = [e["iso2"] for e in entries]
    assert len(isos) == len(set(isos)), "duplicate iso"
    doc = {"version": 2, "countries": entries, "ambiguous": AMBIGUOUS}
    out = os.path.join(HERE, "gazetteer.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    print("countries:", len(entries), "->", out)
    for w in warnings:
        print("warn:", w)
    missing = [i for i in cent if i not in isos]
    print("geojson codes not in gazetteer:", sorted(missing))


if __name__ == "__main__":
    main()
