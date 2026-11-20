import re
from collections import Counter, defaultdict

from django.db import migrations

# The four numbers a free-text item could carry. Everything else a Food
# has (fibre, sugar, sodium) starts out unknown.
LEGACY_NUTRIENTS = ["calories", "protein_g", "carbs_g", "fat_g"]

# Weight and volume are described per 100, the way a nutrition label does;
# countable things (a piece, a slice, a cup) per one.
PER_HUNDRED_UNITS = {"g", "ml"}

# Persian and Arabic-Indic digits, and the Arabic decimal separator, folded
# to ASCII before anything is parsed; Arabic yeh/kaf folded to Persian and
# ZWNJ to a space, so "میلی‌لیتر" and "میلی لیتر" are one spelling.
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩٫", "01234567890123456789.")
_LETTERS = str.maketrans({"ي": "ی", "ى": "ی", "ك": "ک", "‌": " "})

_NUMBER = re.compile(r"^([0-9]+(?:\.[0-9]+)?)(?:\s*/\s*([0-9]+(?:\.[0-9]+)?))?")
_NUMBER_WORDS = {"نصف": 0.5, "نیم": 0.5, "یک": 1.0, "یه": 1.0, "دو": 2.0, "سه": 3.0, "چهار": 4.0, "پنج": 5.0}

# Longest first, so "قاشق غذاخوری" wins over a bare "قاشق".
_UNIT_WORDS = sorted(
    [
        ("قاشق چای خوری", "tsp"),
        ("قاشق چایخوری", "tsp"),
        ("قاشق مرباخوری", "tsp"),
        ("قاشق غذا خوری", "tbsp"),
        ("قاشق غذاخوری", "tbsp"),
        ("قاشق", "tbsp"),
        ("میلی لیتر", "ml"),
        ("سی سی", "ml"),
        ("گرم", "g"),
        ("عدد", "piece"),
        ("دانه", "piece"),
        ("برش", "slice"),
        ("تکه", "slice"),
        ("لیوان", "cup"),
        ("پیمانه", "cup"),
        ("فنجان", "cup"),
        ("کاسه", "bowl"),
        ("پرس", "portion"),
        ("سهم", "portion"),
        ("واحد", "portion"),
        ("grams", "g"),
        ("gram", "g"),
        ("gr", "g"),
        ("g", "g"),
        ("ml", "ml"),
        ("cc", "ml"),
        ("pieces", "piece"),
        ("piece", "piece"),
        ("slices", "slice"),
        ("slice", "slice"),
        ("cups", "cup"),
        ("cup", "cup"),
        ("bowl", "bowl"),
        ("tbsp", "tbsp"),
        ("tsp", "tsp"),
    ],
    key=lambda pair: -len(pair[0]),
)

# For the way back only: what an amount's unit was called in the free text.
UNIT_LABELS = {
    "g": "گرم",
    "ml": "میلی‌لیتر",
    "piece": "عدد",
    "slice": "برش",
    "cup": "لیوان",
    "bowl": "کاسه",
    "tbsp": "قاشق غذاخوری",
    "tsp": "قاشق چای‌خوری",
    "portion": "سهم",
}
_TO_PERSIAN = str.maketrans("0123456789.", "۰۱۲۳۴۵۶۷۸۹٫")


def _normalize(text):
    return " ".join(str(text or "").translate(_DIGITS).translate(_LETTERS).split())


def _match_unit(text):
    """(unit, whatever followed it) for text that starts with a unit word,
    else (None, "")."""
    lowered = text.casefold()
    for word, unit in _UNIT_WORDS:
        if lowered.startswith(word):
            after = text[len(word):]
            # "گرمی" is not "گرم" followed by something — a unit word has
            # to end where a word ends.
            if not after or not after[0].isalpha():
                return unit, after.strip(" .,،-")
    return None, ""


def parse_quantity(text):
    """'۱۵۰ گرم' -> (150.0, 'g', ''); '۲ عدد متوسط' -> (2.0, 'piece', 'متوسط');
    'لیوان' -> (1.0, 'cup', ''). None for anything else — 'کف دست',
    'به میزان دلخواه', blank."""
    s = _normalize(text)
    if not s:
        return None

    match = _NUMBER.match(s)
    if match:
        amount = float(match.group(1))
        if match.group(2):
            divisor = float(match.group(2))
            if not divisor:
                return None
            amount /= divisor
        rest = s[match.end():].strip()
        if not rest:
            # A bare "2": two of whatever the trainer had in mind.
            return (amount, "portion", "") if amount > 0 else None
    else:
        word, _, after_word = s.partition(" ")
        if word in _NUMBER_WORDS:
            amount, rest = _NUMBER_WORDS[word], after_word
        else:
            amount, rest = 1.0, s  # "لیوان" on its own is one cup

    if amount <= 0:
        return None
    unit, leftover = _match_unit(rest)
    if unit is None:
        return None
    return amount, unit, leftover


def _create_food(Food, entry, unit):
    return Food.objects.create(
        name=entry["name"][:100],
        unit=unit,
        serving_size=entry["reference"],
        created_by_id=entry["item"].meal.day.plan.created_by_id,
        **entry["per_reference"],
    )


def move_items_to_food_library(apps, schema_editor):
    """Diet items used to be free text — a name, a quantity string and
    optional macros typed into each meal. Now they point at a Food in the
    library and carry only an amount, so every existing item is turned
    into that shape without changing what the plan says:

      - the quantity is read into an amount and a unit ("۱۵۰ گرم" is 150 of
        a food measured in grams);
      - the item's own macros become the food's, per 100 g / per 1 piece,
        so amount x food gives back exactly the numbers that were typed;
      - items that share a name and unit share a food — the library this
        builds is the one trainers would have typed in themselves;
      - a quantity that can't be read becomes 1 portion of a food whose
        portion is what was written, with the wording kept in notes. The
        numbers still come out the same, and nothing on the plan is lost.
    """
    DietItem = apps.get_model("diet", "DietItem")
    Food = apps.get_model("diet", "Food")

    groups = defaultdict(list)
    for item in DietItem.objects.select_related("meal__day__plan").order_by("id"):
        parsed = parse_quantity(item.quantity)
        if parsed:
            amount, unit, leftover = parsed
        else:
            amount, unit, leftover = 1.0, "portion", item.quantity.strip()

        name = " ".join(item.food_name.split()) or "?"
        reference = 100.0 if unit in PER_HUNDRED_UNITS else 1.0
        per_reference = {
            field: None
            if getattr(item, field) is None
            else round(getattr(item, field) * reference / amount, 2)
            for field in LEGACY_NUTRIENTS
        }
        groups[(_normalize(name).casefold(), unit)].append(
            {
                "item": item,
                "name": name,
                "amount": amount,
                "leftover": leftover,
                "reference": reference,
                "per_reference": per_reference,
                # Rounded for grouping only, so 166.67 and 166.66 — the same
                # food typed at two amounts — don't become two foods.
                "profile": tuple(None if v is None else round(v, 1) for v in per_reference.values()),
            }
        )

    for (_name_key, unit), entries in groups.items():
        known = Counter(e["profile"] for e in entries if any(v is not None for v in e["profile"]))
        # Same name, same unit, different numbers: two different foods as
        # far as anyone can tell, so two foods — merging would silently
        # rewrite one plan's numbers with the other's.
        foods = {}
        for profile, _count in known.most_common():
            first = next(e for e in entries if e["profile"] == profile)
            foods[profile] = _create_food(Food, first, unit)
        # Items that carried no numbers join the food most of their
        # namesakes use — "enter it once" is what the library is for. Only
        # when none of them had numbers is a food made with none.
        fallback = foods[known.most_common(1)[0][0]] if known else _create_food(Food, entries[0], unit)

        for e in entries:
            item = e["item"]
            item.food = foods.get(e["profile"], fallback)
            item.amount = e["amount"]
            item.notes = "، ".join(part for part in (e["leftover"], item.notes) if part)[:255]
        DietItem.objects.bulk_update([e["item"] for e in entries], ["food", "amount", "notes"])


def _persian_number(value):
    return f"{value:.2f}".rstrip("0").rstrip(".").translate(_TO_PERSIAN)


def items_back_to_free_text(apps, schema_editor):
    """The way back: write each item's food and amount out as the text and
    numbers it would have been typed as, so migrating backwards leaves
    every plan reading the same rather than blank."""
    DietItem = apps.get_model("diet", "DietItem")
    items = [item for item in DietItem.objects.select_related("food") if item.food and item.amount]
    for item in items:
        food = item.food
        factor = item.amount / food.serving_size
        item.food_name = food.name
        item.quantity = f"{_persian_number(item.amount)} {UNIT_LABELS.get(food.unit, food.unit)}"[:50]
        item.calories = None if food.calories is None else round(food.calories * factor)
        for field in ("protein_g", "carbs_g", "fat_g"):
            value = getattr(food, field)
            setattr(item, field, None if value is None else round(value * factor, 1))
    DietItem.objects.bulk_update(
        items, ["food_name", "quantity", "calories", "protein_g", "carbs_g", "fat_g"]
    )


class Migration(migrations.Migration):

    dependencies = [
        ("diet", "0005_food_library"),
    ]

    operations = [
        migrations.RunPython(move_items_to_food_library, items_back_to_free_text),
    ]
