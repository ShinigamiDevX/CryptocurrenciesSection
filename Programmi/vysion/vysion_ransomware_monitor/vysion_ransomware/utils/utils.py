import hashlib
import io
import time

from PIL import Image
from selenium.webdriver.common.by import By


class scriptsUtils:
    def __init__(self):
        """
        No constructor logic needed
        """
        self.date_pattern = "%Y-%m-%d %H:%M:%S%z"

    def check_seized_page(self, driver):
        """
        Check if the page has been seized.

        Args:
            driver (WebDriver): The WebDriver instance.

        Returns:
            bool: True if the page has been seized, False otherwise.
        """
        seized_words = ["under the control of", "has been seized"]
            
        return any(word in str(driver.page_source).lower() for word in seized_words)
    
    def manage_exception(self, e):
        """
        Manage exceptions and returns the error message.

        Args:
            e (Exception): The exception to manage.

        Returns:
            message (str): The error message.
            ret_type (int): Type of message, to try and connect again.
        """
        ret_type = 1
        if "not connected to DevTools" in str(e):
            message = "Cannot establish a connection. Try again."
        elif "page crash" in str(e):
            message = "The page suddenly crashed. Try again."
        elif "no such element" in str(e):
            message = ("HTML element not found, probably due to: \n "
                        "\t1. The page structure has changed. \n"
                        "\t2. The page is down or URL is incorrect. \n"
                        "\t3. The page crashed. Try again.")
        elif "ERR_SOCKS_CONNECTION_FAILED" in str(e):
            message = ("Cannot establish a connection, probably due to: \n "
                        "\t1. Cannot connect for the moment. Try again. \n"
                        "\t2. The page is down or the URL is incorrect.")
        elif e.__class__.__name__ == "TimeoutException":
            message = ("Timeout error while searching for a HTML element, probably due to: \n"
                        "\t1. The page structure has changed. \n"
                        "\t2. The page is down or the URL is incorrect. \n"
                        "\t3. Slow connection. Try again.")
        elif e.__class__.__name__ == "KeyboardInterrupt":
            message = "Keyboard interrupt"
            ret_type = 2
        else:
            message = str(e)
            ret_type = 2
        return message, ret_type

    def save_screenshot(self, driver, height=0, scroll=True):
        """
        Takes a screenshot of the current webpage displayed by the driver and saves it to the specified filename.

        Args:
            driver: The WebDriver instance used to interact with the browser.
            filename (str): The name of the file to save the screenshot as.
            height (int, optional): The height of the browser window. Defaults to 0.
            scroll (bool, optional): Whether to scroll to the bottom of the page before taking the screenshot. Defaults to True.

        Returns:
            Image: The screenshot image.
        """
        try:
            if scroll:
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(2)

            if height != 0:
                total_height = height
            else:
                total_height = driver.execute_script("return document.body.scrollHeight")

            # some heights exceed the limit of the browser (1500 as limit), multiple screenshots must be taken
            scrollview = 1500
            n = (total_height + scrollview - 1) // scrollview

            screenshots = []
            if n < 2 or not scroll:
                driver.set_window_size(1920, total_height)
                time.sleep(1)
                screenshots.append(Image.open(io.BytesIO(driver.get_screenshot_as_png())))
            else:
                for i in range(n):
                    driver.execute_script(f"window.scrollTo(0, {scrollview*i});")
                    driver.set_window_size(1920, scrollview)
                    time.sleep(1)
                    screenshots.append(Image.open(io.BytesIO(driver.get_screenshot_as_png())))

            # Create a new image with a white background that can contain all images
            total_width = screenshots[0].width
            total_height = sum(img.height for img in screenshots)

            combined = Image.new("RGB", (total_width, total_height))

            y_offset = 0
            for img in screenshots:
                combined.paste(img, (0, y_offset))
                y_offset += img.height

        except Exception as e:
            print(f"Error while taking a screenshot: {e}")
            return None

        return combined

    def get_element_text(self, driver, class_name):
        """
        Get the text of an element identified by its class name.

        Args:
            driver (WebDriver): The WebDriver instance.
            class_name (str): The class name of the element.

        Returns:
            str: The text of the element.
        """
        return driver.find_element(By.CLASS_NAME, class_name).text

    def get_hashes(self, input):
        """
        Calculate the SHA256 and SHA1 hashes of the input string.

        Args:
            input (str): The input string to be hashed.

        Returns:
            list: A list containing the SHA256 and SHA1 hashes of the input string.
        """
        sha1sum = hashlib.sha1(input.encode("utf-8")).hexdigest()
        sha256sum = hashlib.sha256(input.encode("utf-8")).hexdigest()
        return sha1sum, sha256sum
