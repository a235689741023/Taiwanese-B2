# 資料前處理比對報告

## 統計

- ai_article_questions: 236
- ai_prompts: 190
- article_audio1: 30
- article_audio2: 29
- articles1: 30
- articles2: 29
- ext_broken: 8
- ext_dict: 1964
- ext_empty: 2
- ext_unverified: 36
- sent_dict: 810
- sent_unverified: 30
- vocab_dict: 856
- vocab_dict_entry: 844
- 音檔總數: 4707；總大小: 302.3 MB

說明：`dict` = 已依教育部辭典校正或確認；`unverified` = 臺羅格式正常但辭典比對不到（保留課本原文）；`broken` = 有缺字或缺調號且無法自動補正，需人工檢查。

## 待人工檢查

| id | 漢字 | 課本原始抽取 | 輸出 | 狀態 |
|---|---|---|---|---|


## 隨機抽樣 30 筆（請對照課本與音檔）

| id | 漢字 | 臺羅 | 華語 | 音檔 |
|---|---|---|---|---|
| w1-332 | 隨在 | suî-tsāi | 任憑、任由 | su/11999_1.mp3 |
| w1-155 | 硞 | kho̍k | 碰撞、碰撞聲 | su/8767_1.mp3 |
| w1-405 | 查某 | tsa-bóo | 女人、女性 | su/5095_1.mp3 |
| w2-163 | 冗 | liōng | 寬裕、留餘裕 | su/582_1.mp3 |
| w1-050 | 戇 | gōng | 傻 | su/13412_1.mp3 |
| w1-075 | 彼 | hit | 那 | su/3876_1.mp3 |
| w2-337 | 茈 | tsínn | 嫩 | su/6534_1.mp3 |
| w2-045 | 凝 | gîng | 鬱結 | su/11592_1.mp3 |
| w1-097 | 芫荽 | iân-sui | 香菜 | su/4461_1.mp3 |
| w1-375 | 佇 | tī | 在 | su/2858_1.mp3 |
| w2-093 | 家私 | ke-si | 工具、道具、槍械武器 | su/5913_1.mp3 |
| w1-060 | 譀 | hàm | 荒誕不實、放大 | su/12865_1.mp3 |
| w2-016 | 目 | ba̍k | 眼 | su/1854_1.mp3 |
| w1-220 | 媽 | má | 祖母、媽祖、女神 | su/9406_1.mp3 |
| w1-039 | 的 | ê | 的 | su/4370_1.mp3 |
| s1-02-12 | 落雨天的時陣，這條路就變甲真歹行。 | Lo̍h-hōo-thinn ê sî-tsūn, tsit tiâu lōo tō piàn kah tsin pháinn kiânn. | 下雨天的時候，這條路就變得很難走。 | tb/0301_02_12_15.mp3 |
| s2-01-25 | 伊猶未講煞，毋通僭話。 | I iáu-buē kóng-suah, m̄-thang tsiàm-uē. | 他還沒有說完，不要搶話。 | tb/0302_01_25_06.mp3 |
| s2-01-09 | 伊是阮祧仔內的。 | I sī guán thiāu-á-lāi--ê. | 他是我們同宗的。 | tb/0302_01_09_04.mp3 |
| s1-01-72 | 你號做啥物名？ | Lí hō-tsò siánn-mih miâ? | 你叫什麼名字？ | tb/0301_01_72_13.mp3 |
| s1-09-09 | 伊事業做了袂䆀。 | I sū-gia̍p tsò liáu bē-bái. | 他的企業經營很成功。 | tb/0301_09_09_42.mp3 |
| s1-03-04 | 我猶未食飯。 | Guá iáu-buē tsia̍h pn̄g. | 我還沒吃飯。 | tb/0301_03_04_16.mp3 |
| s2-04-26 | 天氣冷矣，你就愛加疊一領衫。 | Thinn-khì líng--ah, lí tō ài ke tha̍h tsi̍t niá sann. | 天冷了，你要加件衣服。 | tb/0302_04_26_24.mp3 |
| s2-01-15 | 這擺我存死欲佮伊拚。 | Tsit pái guá tshûn-sí beh kah i piànn. | 這回我豁出去跟他拚了。 | tb/0302_01_15_05.mp3 |
| s1-01-61 | 逐家咧開講，講甲笑咍咍。 | Ta̍k-ke teh khai-káng, kóng kah tshiò-hai-hai. | 大家在聊天，說得哈哈笑。 | tb/0301_01_61_11.mp3 |
| s2-05-03 | 西照日的厝較燒熱。 | Sai-tsiò-ji̍t ê tshù khah sio-jua̍h. | 西曬的房子較熱。 | tb/0302_05_03_27.mp3 |
| s1-04-09 | 你去共門開開。 | Lí khì kā mn̂g khui--khui. | 你去將門打開。 | tb/0301_04_09_22.mp3 |
| s1-08-09 | 這條歌你會曉唱無？ | Tsit tiâu kua lí ē-hiáu tshiùnn--bô? | 這首歌你會不會唱？ | tb/0301_08_09_39.mp3 |
| s2-08-15 | 若是攏無人欲去，咱就抽鬮來決定。 | Nā-sī lóng bô-lâng beh khì, lán tō thiu-khau lâi kuat-tīng. | 若沒有人要去，我們就抽籤來決定。 | tb/0302_08_15_39.mp3 |
| s2-08-12 | 你毋是去買物件，哪會空手轉來？ | Lí m̄ sī khì bé mi̍h-kiānn, ná ē khang-tshiú tńg--lâi? | 你不是要去買東西，怎麼空手回來？ | tb/0302_08_12_38.mp3 |
| s2-06-06 | 外面當咧透風，你莫閣出去矣。 | Guā-bīn tng-teh thàu-hong, lí mài koh tshut--khì--ah. | 外頭颳起大風了，你不要再出去了。 | tb/0302_06_06_30.mp3 |
