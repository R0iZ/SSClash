'use strict';

/**
 * Shared helpers for Real-IP Domain Set mode — merge a DNS sample into config.yaml
 * (no Mihomo fake-ip). Used by settings save and the config editor page.
 */
(function (global) {
    const DNS_MARK_BEGIN = '# SSClash Domain Set DNS: BEGIN';
    const DNS_MARK_END = '# SSClash Domain Set DNS: END';
    const LEGACY_FIP_BEGIN = '# SSClash Domain Set: BEGIN';
    const LEGACY_FIP_END = '# SSClash Domain Set: END';

    function isEnabled(mode) {
        return mode === 'domain-set' || mode === 'real-ip';
    }

    function stripMarkedBlock(lines, beginMarker, endMarker) {
        const out = [];
        let skipping = false;
        for (const line of lines) {
            if (line.includes(beginMarker)) {
                skipping = true;
                continue;
            }
            if (line.includes(endMarker)) {
                skipping = false;
                continue;
            }
            if (!skipping) out.push(line);
        }
        return out;
    }

    function findDnsSectionEnd(lines, dnsStart) {
        for (let i = dnsStart + 1; i < lines.length; i++) {
            if (/^[A-Za-z][^:\s]*:/.test(lines[i]) && !/^\s/.test(lines[i])) {
                return i;
            }
        }
        return lines.length;
    }

    function stripFakeIpDnsKeys(lines) {
        const out = [];
        let inDns = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (/^dns:\s*$/.test(line.trim())) {
                inDns = true;
                out.push(line);
                continue;
            }

            if (inDns && /^[A-Za-z][^:\s]*:/.test(line) && !/^\s/.test(line)) {
                inDns = false;
            }

            if (inDns) {
                if (/^\s{2}enhanced-mode:\s*fake-ip/.test(line)) continue;
                if (/^\s{2}fake-ip-range:/.test(line)) continue;
                if (/^\s{2}fake-ip-filter-mode:/.test(line)) continue;
                if (/^\s{2}fake-ip-filter:\s*$/.test(line)) {
                    i++;
                    while (i < lines.length) {
                        const next = lines[i];
                        if (/^[A-Za-z][^:\s]*:/.test(next) && !/^\s/.test(next)) {
                            i--;
                            break;
                        }
                        if (/^\s{2}[A-Za-z0-9_.-]+:/.test(next) && !/^\s{4,}/.test(next)) {
                            i--;
                            break;
                        }
                        i++;
                    }
                    continue;
                }
            }

            if (/^\s*store-fake-ip:\s*true\s*(#.*)?$/.test(line)) {
                out.push(line.replace(/\btrue\b/, 'false'));
                continue;
            }

            out.push(line);
        }

        return out;
    }

    function buildManagedDnsBlock() {
        return [
            `  ${DNS_MARK_BEGIN}`,
            '  # Real-IP routing: use router/LAN DNS on clients; Mihomo must not use fake-ip here.',
            '  # SSClash: dnsmasq nftset → domain_proxy; rule-provider IP-CIDR → domain_proxy_cidr.',
            '  use-system-hosts: true',
            '  nameserver:',
            '    - 192.168.1.1  # change to your LAN DNS / router IP',
            '  default-nameserver:',
            '    - 192.168.1.1',
            `  ${DNS_MARK_END}`
        ];
    }

    function ensureDnsSectionBasics(lines, dnsStart) {
        const dnsEnd = findDnsSectionEnd(lines, dnsStart);
        const slice = lines.slice(dnsStart + 1, dnsEnd);
        const hasEnable = slice.some(l => /^\s{2}enable:\s*true/.test(l));
        const hasListen = slice.some(l => /^\s{2}listen:/.test(l));
        const insert = [];
        if (!hasEnable) insert.push('  enable: true');
        if (!hasListen) insert.push('  listen: 0.0.0.0:7874');
        if (!slice.some(l => /^\s{2}ipv6:/.test(l))) insert.push('  ipv6: false');
        if (insert.length === 0) return dnsStart + 1;
        lines.splice(dnsStart + 1, 0, ...insert);
        return dnsStart + 1 + insert.length;
    }

    function mergeDnsSample(lines) {
        let dnsStart = -1;
        for (let i = 0; i < lines.length; i++) {
            if (/^dns:\s*$/.test(lines[i].trim())) {
                dnsStart = i;
                break;
            }
        }

        if (dnsStart === -1) {
            let insertAt = 0;
            for (let i = 0; i < lines.length; i++) {
                if (/^mode:/.test(lines[i].trim())) {
                    insertAt = i + 1;
                    break;
                }
            }
            const block = [
                '',
                '# DNS — Real-IP Domain Set (SSClash)',
                'dns:',
                '  enable: true',
                '  listen: 0.0.0.0:7874',
                '  ipv6: false',
                ...buildManagedDnsBlock()
            ];
            lines.splice(insertAt, 0, ...block);
            return lines;
        }

        const insertAt = ensureDnsSectionBasics(lines, dnsStart);
        lines.splice(insertAt, 0, ...buildManagedDnsBlock());
        return lines;
    }

    function apply(content, enabled) {
        if (!content) return content;

        let lines = content.replace(/\r\n/g, '\n').split('\n');
        lines = stripMarkedBlock(lines, DNS_MARK_BEGIN, DNS_MARK_END);
        lines = stripMarkedBlock(lines, LEGACY_FIP_BEGIN, LEGACY_FIP_END);
        lines = stripFakeIpDnsKeys(lines);

        if (!enabled) {
            return lines.join('\n');
        }

        lines = mergeDnsSample(lines);
        return lines.join('\n');
    }

    function parseDomainSetModeFromSettings(settingsText) {
        if (!settingsText) return 'off';
        for (const line of settingsText.split('\n')) {
            const eq = line.indexOf('=');
            if (eq === -1) continue;
            const key = line.slice(0, eq).trim();
            const value = line.slice(eq + 1).trim();
            if (key === 'DOMAIN_SET_MODE') return value || 'off';
        }
        return 'off';
    }

    global.SSClashDomainSetConfig = {
        isEnabled,
        apply,
        parseDomainSetModeFromSettings
    };
})(typeof window !== 'undefined' ? window : this);
