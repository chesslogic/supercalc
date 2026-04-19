// calculator/dropdown-controller.js — shared dropdown lifecycle factory

/**
 * Creates a reusable dropdown controller that wires up the shared open/close
 * lifecycle, clear button, and data-availability polling used by both the
 * weapon and enemy selectors.
 *
 * @param {object} options
 * @param {HTMLElement} options.inputEl - the text input for the selector
 * @param {HTMLElement} options.dropdownEl - the dropdown list container
 * @param {HTMLElement} options.selectorEl - parent wrapper; clear button is appended here
 * @param {() => void} options.onClear - called when the clear button is clicked (before repopulate)
 * @param {(query: string) => void} options.populate - renders dropdown items for a given query
 * @param {() => boolean} [options.isDataReady] - returns true once async data is available
 * @param {() => void} [options.onDataReady] - called once when isDataReady becomes true
 * @returns {{ openDropdown: () => void, closeDropdown: () => void }}
 */
export function createDropdownController({
  inputEl,
  dropdownEl,
  selectorEl,
  onClear,
  populate,
  isDataReady = () => true,
  onDataReady = null
}) {
  const clearButton = document.createElement('button');
  clearButton.className = 'calculator-clear-btn';
  clearButton.textContent = '×';
  clearButton.type = 'button';
  clearButton.addEventListener('click', (event) => {
    event.stopPropagation();
    onClear();
    populate('');
  });
  selectorEl.appendChild(clearButton);

  let isOpen = false;

  function openDropdown() {
    isOpen = true;
    dropdownEl.classList.remove('hidden');
    populate(inputEl.value);
  }

  function closeDropdown() {
    isOpen = false;
    dropdownEl.classList.add('hidden');
  }

  inputEl.addEventListener('focus', () => {
    if (!isOpen) {
      openDropdown();
    }
  });

  inputEl.addEventListener('input', (event) => {
    if (!isOpen) {
      openDropdown();
    }
    populate(event.target.value);
  });

  document.addEventListener('click', (event) => {
    if (!inputEl.contains(event.target) && !dropdownEl.contains(event.target)) {
      closeDropdown();
    }
  });

  populate('');

  const checkDataAvailability = setInterval(() => {
    if (isDataReady()) {
      onDataReady?.();
      if (isOpen) {
        populate(inputEl.value);
      }
      clearInterval(checkDataAvailability);
    }
  }, 200);

  setTimeout(() => clearInterval(checkDataAvailability), 5000);

  return { openDropdown, closeDropdown };
}
