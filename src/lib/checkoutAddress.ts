export const DEFAULT_ADDRESS_REGION = "Улаанбаатар";

const UB_DISTRICTS = [
  "Багануур",
  "Багахангай",
  "Баянгол",
  "Баянзүрх",
  "Налайх",
  "Сонгинохайрхан",
  "Сүхбаатар",
  "Хан-Уул",
  "Чингэлтэй",
] as const;

const PROVINCES = [
  "Архангай",
  "Баян-Өлгий",
  "Баянхонгор",
  "Булган",
  "Говь-Алтай",
  "Говьсүмбэр",
  "Дархан-Уул",
  "Дорноговь",
  "Дорнод",
  "Дундговь",
  "Завхан",
  "Орхон",
  "Өвөрхангай",
  "Өмнөговь",
  "Сүхбаатар",
  "Сэлэнгэ",
  "Төв",
  "Увс",
  "Ховд",
  "Хөвсгөл",
  "Хэнтий",
] as const;

const LOCAL_AREA_OPTIONS = ["Аймгийн төв", "Сумын төв", "Бусад байршил"] as const;

const DISTRICT_KHOROO_COUNT: Record<string, number> = {
  Багануур: 5,
  Багахангай: 2,
  Баянгол: 34,
  Баянзүрх: 43,
  Налайх: 8,
  Сонгинохайрхан: 43,
  Сүхбаатар: 20,
  "Хан-Уул": 25,
  Чингэлтэй: 24,
};

export function getRegionOptions(): string[] {
  return [DEFAULT_ADDRESS_REGION, ...PROVINCES];
}

export function getDistrictOrSoumOptions(region: string): string[] {
  if (region === DEFAULT_ADDRESS_REGION) {
    return [...UB_DISTRICTS];
  }

  return [...LOCAL_AREA_OPTIONS];
}

export function getKhorooOrBagOptions(region: string, districtOrSoum: string): string[] {
  if (!districtOrSoum.trim()) {
    return [];
  }

  if (region === DEFAULT_ADDRESS_REGION) {
    const count = DISTRICT_KHOROO_COUNT[districtOrSoum] ?? 20;
    return Array.from({ length: count }, (_, index) => `${index + 1}-р хороо`);
  }

  return Array.from({ length: 10 }, (_, index) => `${index + 1}-р баг`);
}
