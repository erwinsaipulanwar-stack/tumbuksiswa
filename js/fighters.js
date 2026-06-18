document.addEventListener('DOMContentLoaded', () => {
    const fighterCards = document.querySelectorAll('.fighter-card');

    fighterCards.forEach(card => {
        card.addEventListener('click', () => {
            const name = card.querySelector('h2').textContent;
            const record = card.querySelector('.record-badge').textContent;
            const school = card.querySelector('.school').textContent;
            
            alert(`🥊 Fighter Profile: \nNama: ${name} \nAsal: ${school} \nRekor (Win-Loss-Draw): ${record}`);
        });
    });
});