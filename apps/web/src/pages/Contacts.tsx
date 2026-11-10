import { useEffect, useRef } from 'react';
import { Clock, Loader2, Mail, MapPin, Navigation, Phone } from 'lucide-react';
import RedesignHeader from '@/redesign/components/RedesignHeader';
import FooterSection from '@/components/FooterSection';
import LeadHighlightSection from '@/redesign/components/LeadHighlightSection';
import MapUnavailableNotice from '@/redesign/components/MapUnavailableNotice';
import { useYandexMapsReady } from '@/shared/hooks/useYandexMapsReady';
import { useInViewOnce } from '@/shared/hooks/useInViewOnce';
import { useSiteSettings, settingOptional } from '@/redesign/hooks/useSiteSettings';
import { useSiteBrand } from '@/redesign/hooks/useSiteBrand';
import { telHref, yandexMapsHref } from '@/lib/contact-links';
import officeImage from '@/assets/about-main.jpg';

const Contacts = () => {
  const { data: s } = useSiteSettings();
  const { shortName } = useSiteBrand();

  const phone = settingOptional(s, 'phone_main');
  const phoneSecondary = settingOptional(s, 'phone_secondary');
  const tollFree = phone ? /^\s*(8|\+7)\s*\(?800/.test(phone) : false;
  const email = settingOptional(s, 'email') ?? settingOptional(s, 'contacts_email');
  const address = settingOptional(s, 'address') ?? settingOptional(s, 'contacts_address');
  const workHours = settingOptional(s, 'contacts_work_hours') ?? settingOptional(s, 'work_hours');
  const officeTitle = settingOptional(s, 'office_title') ?? `Офис ${shortName}`;
  const photo = settingOptional(s, 'contact_block_image') || officeImage;
  const lat = settingOptional(s, 'office_lat');
  const lng = settingOptional(s, 'office_lng');

  const mapsUrl =
    address || (lat && lng) ? yandexMapsHref({ address, officeLat: lat, officeLng: lng }) : undefined;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInView = useInViewOnce(mapRef);
  const { ready: ymapsReady, failure } = useYandexMapsReady({ enabled: mapInView });
  const mapBuiltRef = useRef(false);

  const latNum = Number(lat);
  const lngNum = Number(lng);
  const hasCoords = Number.isFinite(latNum) && Number.isFinite(lngNum) && latNum !== 0 && lngNum !== 0;

  useEffect(() => {
    if (!ymapsReady || !hasCoords || !mapRef.current || mapBuiltRef.current) return;
    const ymaps = (window as unknown as { ymaps?: any }).ymaps;
    if (!ymaps) return;
    mapBuiltRef.current = true;

    const map = new ymaps.Map(mapRef.current, {
      center: [latNum, lngNum],
      zoom: 16,
      controls: ['zoomControl', 'fullscreenControl'],
    });
    map.geoObjects.add(
      new ymaps.Placemark([latNum, lngNum], { hintContent: officeTitle }, { preset: 'islands#greenDotIcon' }),
    );
    return () => {
      map.destroy?.();
      mapBuiltRef.current = false;
    };
  }, [ymapsReady, hasCoords, latNum, lngNum, officeTitle]);

  /** Строки контактов: чего нет в настройках — не рисуем, заглушек не придумываем. */
  const rows = [
    address ? { icon: MapPin, label: 'Адрес', value: address, href: mapsUrl } : null,
    workHours ? { icon: Clock, label: 'График работы', value: workHours, href: undefined } : null,
    phone ? { icon: Phone, label: tollFree ? 'Телефон · бесплатно по России' : 'Телефон', value: phone, href: telHref(phone) } : null,
    phoneSecondary ? { icon: Phone, label: 'Мобильный', value: phoneSecondary, href: telHref(phoneSecondary) } : null,
    email ? { icon: Mail, label: 'Почта', value: email, href: `mailto:${email}` } : null,
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string; href?: string }[];

  return (
    <div className="min-h-screen bg-background pb-16 lg:pb-0">
      <RedesignHeader />

      <section className="section-y" aria-labelledby="contacts-title">
        <div className="container-page grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
          <div>
            <p className="text-overline text-muted-foreground">Наш офис</p>
            <h1 id="contacts-title" className="text-section-title mt-3">
              Приезжайте на чашку кофе
            </h1>
            <p className="mt-4 max-w-[520px] text-sm leading-relaxed text-muted-foreground sm:text-base">
              Покажем подборку на большом экране, разберём планировки и документы.
              Консультация и кофе бесплатные, записываться заранее не нужно.
            </p>

            <div className="mt-8 overflow-hidden rounded-[20px] bg-muted">
              <img
                src={photo}
                alt={officeTitle}
                className="aspect-[16/10] w-full object-cover"
                loading="lazy"
                decoding="async"
                width={640}
                height={400}
              />
            </div>

            {rows.length > 0 ? (
              <ul className="mt-8 space-y-5">
                {rows.map(({ icon: Icon, label, value, href }) => (
                  <li key={label} className="flex items-start gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                      {href ? (
                        <a
                          href={href}
                          target={href.startsWith('http') ? '_blank' : undefined}
                          rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                          className="mt-1 inline-flex min-h-11 items-center text-base font-medium text-foreground transition-colors hover:text-primary"
                        >
                          {value}
                        </a>
                      ) : (
                        <p className="mt-1 text-base font-medium text-foreground">{value}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-8 text-sm text-muted-foreground">
                Контакты пока не заполнены в настройках сайта.
              </p>
            )}
          </div>

          <div>
            <div
              ref={mapRef}
              className="relative h-[320px] w-full overflow-hidden rounded-[20px] border border-border bg-muted sm:h-[420px] lg:h-[480px]"
            >
              {!hasCoords ? (
                <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <MapPin className="h-7 w-7 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-medium">Координаты офиса не заданы</p>
                  <p className="max-w-[320px] text-xs leading-relaxed text-muted-foreground">
                    Добавьте их в настройках сайта: поля office_lat и office_lng.
                  </p>
                </div>
              ) : failure ? (
                <MapUnavailableNotice failure={failure} />
              ) : !ymapsReady ? (
                // Яндекс.Карты поднимаются долго — не оставляем пустой прямоугольник
                <div className="absolute inset-0 z-[5] flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Загружаем карту…
                </div>
              ) : null}
            </div>

            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-12 items-center gap-2 rounded-xl border border-border px-5 text-[15px] font-medium transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Navigation className="h-4 w-4" />
                Открыть в Яндекс Картах
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <LeadHighlightSection source="contacts:selection" />
      <FooterSection />
    </div>
  );
};

export default Contacts;
