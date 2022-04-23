const navigate = (route) => {
    document.querySelector('navigation').setAttribute('route', route)
};
document.querySelectorAll('nav').forEach((nav) => {
    nav.addEventListener('click', () => {
        navigate(nav.getAttribute('route'));
    })
})
