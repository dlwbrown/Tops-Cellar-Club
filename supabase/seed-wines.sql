-- TOPS Cellar Selection Club — starter wine catalogue.
-- Run once in the Supabase SQL Editor. These become real, favouritable/ratable wines
-- (the app's hardcoded "seed-..." bottles are just placeholders until this table has rows).

insert into wines (name, producer, region, country, varietal, story, food_pairings, serving_temp, tasting_notes, awards, avg_rating)
values
  ('Palladius 2022', 'Sadie Family Wines', 'Swartland', 'South Africa', 'White Blend',
   'A legendary white blend of eleven varieties from old Swartland bush vines, fermented and aged in concrete and old oak. One of the Cape''s most celebrated white wines.',
   'Roast chicken, line-fish, mature hard cheeses', 'Serve at 12–14°C',
   'Layered stone fruit, dried pear, fynbos and a saline, mineral finish.', 'Tim Atkin 97pts · Platter''s 5 Stars', 4.8),

  ('Heritage Heroes 2021', 'Nederburg', 'Western Cape', 'South Africa', 'Red Blend',
   'A tribute to Nederburg''s winemaking legacy — a generous, supple Cape red built for the table.',
   'Braai, lamb, tomato-based dishes', 'Serve at 16–18°C',
   'Ripe plum, mulberry, cedar and a touch of spice.', 'Veritas Gold', 4.2),

  ('Kleine Zalze Family Reserve Chenin Blanc 2022', 'Kleine Zalze', 'Stellenbosch', 'South Africa', 'Chenin Blanc',
   'Old-vine Chenin from select Stellenbosch parcels, barrel-fermented for richness and length.',
   'Grilled prawns, creamy pasta, roast pork', 'Serve at 11–13°C',
   'Quince, honeycomb, toasted almond and bright acidity.', 'Platter''s 5 Stars', 4.5),

  ('Six Dogs Blue Gin', 'Six Dogs', 'Wellington', 'South Africa', 'Gin',
   'A small-batch Karoo gin infused with blue pea flower — it pours indigo and turns pink with tonic.',
   'Premium tonic, citrus, olives', 'Serve over ice',
   'Floral, juniper-forward, with delicate spice and a smooth finish.', 'Craft Distillers'' Gold', 4.7),

  ('The Chocolate Block 2022', 'Boekenhoutskloof', 'Swartland', 'South Africa', 'Red Blend',
   'A Syrah-led cult blend with Grenache, Cabernet, Cinsault and a splash of Viognier. Richly hedonistic yet polished.',
   'Dry-aged steak, venison, dark chocolate', 'Serve at 16–18°C',
   'Black cherry, cured meat, violets, mocha and fine grippy tannins.', 'Tim Atkin 94pts', 4.6),

  ('Hamilton Russell Pinot Noir 2022', 'Hamilton Russell Vineyards', 'Hemel-en-Aarde', 'South Africa', 'Pinot Noir',
   'From cool maritime clay soils, this is South Africa''s benchmark Pinot Noir — elegant, ageworthy and Burgundian in spirit.',
   'Duck, mushroom risotto, salmon', 'Serve at 14–16°C',
   'Red cherry, forest floor, rose and a silky, savoury length.', 'Platter''s 5 Stars · Tim Atkin 95pts', 4.9),

  ('Klein Constantia Vin de Constance 2019', 'Klein Constantia', 'Constantia', 'South Africa', 'Natural Sweet',
   'The historic sweet wine once loved by Napoleon and Jane Austen — made from late-harvest Muscat de Frontignan.',
   'Blue cheese, crème brûlée, fruit tart', 'Serve at 8–10°C',
   'Apricot, orange marmalade, honey and spice with vibrant acidity.', '100pts · Decanter', 4.9),

  ('Graham Beck Brut NV', 'Graham Beck', 'Robertson', 'South Africa', 'Cap Classique',
   'The celebratory Cape sparkling poured at presidential inaugurations — Chardonnay and Pinot Noir, bottle-fermented.',
   'Oysters, fried chicken, celebration', 'Serve at 6–8°C',
   'Green apple, citrus, brioche and a crisp, fine mousse.', 'Amorim Cap Classique Champion', 4.4);
