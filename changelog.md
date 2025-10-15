# 1.0.0 (stable) – 2025-10-09
- LI generátor (krátké/střední/dlouhé), bez Markdownu/emoji, #springwalk + povinný link
- Validace ČAK + délky (#springwalk, link)
- Drafty (uložení verzí), načítání draftů
- Zkracovač na 900 znaků (ponechá odstavce, tagy + link na konci)
- Suggest-hashtags (3 doporučené) a přidání na konec



chore(release): bump to v1.2.0 (Milestone A)

# Changelog

## [1.2.0] – 2025-10-10
### Added
- Multi-channel UI (LI/FB/IG/Blog), IG ALT text, Blog struktura.
- UTM autopreset podle kanálu.
- CORS pro všechny Edge Functions.

### Fixed
- Hashtagy (správné čtení z API, #springwalk tail).
- Shorten zachovává odstavce.
- Save draft: bezpečné uložení s link_url.

## [1.1.0] – 2025-10-09
### Added
- Stabilní MVP LI generování, validace, drafty, presety TOV (multi-select), UTM builder.

